from abc import ABC, abstractmethod
from typing import AsyncIterable
import json
import logging

from openai import AsyncOpenAI
import anthropic

from app.config import settings
from app.core.events import (
    LLMEvent,
    ContentDeltaEvent,
    ToolCallStartEvent,
    ToolCallDeltaEvent,
    ToolCallFinishEvent,
    FinishEvent,
    ErrorEvent,
)

logger = logging.getLogger(__name__)


class ProviderConfig:
    """Provider 配置"""
    def __init__(self, api_key: str = "", model: str = "", base_url: str = ""):
        self.api_key = api_key
        self.model = model
        self.base_url = base_url


class BaseLLM(ABC):
    """LLM Provider 抽象基类"""

    @abstractmethod
    async def chat_stream(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
    ) -> AsyncIterable[LLMEvent]:
        """流式对话，统一返回 LLMEvent 事件"""
        pass

    @property
    @abstractmethod
    def supports_tools(self) -> bool:
        """是否支持工具调用"""
        pass

    def adapt_tools(self, tools: list[dict]) -> list[dict]:
        """将标准工具格式适配为 provider 特定格式（子类可覆盖）"""
        return tools


# ---------------------------------------------------------------------------
# OpenAI 兼容 Provider（OpenAI / Local / Custom 共用）
# ---------------------------------------------------------------------------

class OpenAICompatibleLLM(BaseLLM):
    """OpenAI API 兼容的 Provider"""

    def __init__(self, config: ProviderConfig):
        kwargs = {"api_key": config.api_key}
        if config.base_url:
            kwargs["base_url"] = config.base_url
        self.client = AsyncOpenAI(**kwargs)
        self.model = config.model
        self._supports_tools = True

    @property
    def supports_tools(self) -> bool:
        return self._supports_tools

    async def chat_stream(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
    ) -> AsyncIterable[LLMEvent]:
        try:
            kwargs = {
                "model": self.model,
                "messages": messages,
                "stream": True,
                "stream_options": {"include_usage": True},
            }
            if tools:
                kwargs["tools"] = self.adapt_tools(tools)

            stream = await self.client.chat.completions.create(**kwargs)

            # 追踪流式 tool call 状态
            pending_tool_calls: dict[str, dict] = {}

            async for chunk in stream:
                choice = chunk.choices[0] if chunk.choices else None
                if not choice:
                    # usage 信息
                    if chunk.usage:
                        yield FinishEvent(
                            reason="stop",
                            usage={
                                "prompt_tokens": chunk.usage.prompt_tokens,
                                "completion_tokens": chunk.usage.completion_tokens,
                            }
                        )
                    continue

                delta = choice.delta

                # 文本内容
                if delta.content:
                    yield ContentDeltaEvent(text=delta.content)

                # Tool calls 增量
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        tid = tc.id or tc.index
                        if tid not in pending_tool_calls:
                            pending_tool_calls[tid] = {
                                "id": tc.id,
                                "name": tc.function.name or "",
                                "arguments": tc.function.arguments or "",
                            }
                            if tc.function.name:
                                yield ToolCallStartEvent(
                                    tool_call_id=tc.id or str(tc.index),
                                    name=tc.function.name,
                                )
                        else:
                            pending_tool_calls[tid]["arguments"] += tc.function.arguments or ""
                            yield ToolCallDeltaEvent(
                                tool_call_id=tc.id or str(tc.index),
                                arguments_delta=tc.function.arguments or "",
                            )

                # 完成原因
                if choice.finish_reason:
                    # 先 flush 所有 pending tool calls
                    for tid, info in pending_tool_calls.items():
                        if info["name"]:
                            yield ToolCallFinishEvent(
                                tool_call_id=info["id"] or tid,
                                name=info["name"],
                                arguments=info["arguments"],
                            )
                    yield FinishEvent(reason=choice.finish_reason)

        except Exception as e:
            logger.error(f"OpenAI stream error: {e}")
            yield ErrorEvent(error=str(e))


class OpenAILLM(OpenAICompatibleLLM):
    def __init__(self, config: ProviderConfig):
        super().__init__(ProviderConfig(
            api_key=config.api_key or settings.openai_api_key,
            model=config.model or settings.openai_model,
            base_url=config.base_url,
        ))


class LocalLLM(OpenAICompatibleLLM):
    def __init__(self, config: ProviderConfig):
        base = config.base_url or settings.ollama_base_url
        super().__init__(ProviderConfig(
            api_key=config.api_key or "ollama",
            model=config.model or "llama3.1",
            base_url=base + "/v1" if base else "",
        ))


class CustomLLM(OpenAICompatibleLLM):
    def __init__(self, config: ProviderConfig):
        super().__init__(ProviderConfig(
            api_key=config.api_key or settings.openai_api_key,
            model=config.model or "custom",
            base_url=config.base_url,
        ))


# ---------------------------------------------------------------------------
# Claude Provider
# ---------------------------------------------------------------------------

class ClaudeLLM(BaseLLM):
    """Anthropic Claude Provider"""

    def __init__(self, config: ProviderConfig):
        self.client = anthropic.AsyncAnthropic(
            api_key=config.api_key or settings.anthropic_api_key
        )
        self.model = config.model or settings.anthropic_model

    @property
    def supports_tools(self) -> bool:
        return True

    def adapt_tools(self, tools: list[dict]) -> list[dict]:
        """将 OpenAI 格式转为 Claude 格式"""
        claude_tools = []
        for t in tools:
            fn = t.get("function", {})
            claude_tools.append({
                "name": fn.get("name"),
                "description": fn.get("description"),
                "input_schema": fn.get("parameters", {"type": "object", "properties": {}}),
            })
        return claude_tools

    async def chat_stream(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
    ) -> AsyncIterable[LLMEvent]:
        try:
            # 分离 system 消息
            system_msg = ""
            conv_messages = []
            for m in messages:
                if m["role"] == "system":
                    system_msg = m["content"]
                elif m["role"] == "tool":
                    # Claude 用 user 角色包裹 tool result
                    conv_messages.append({
                        "role": "user",
                        "content": [{
                            "type": "tool_result",
                            "tool_use_id": m.get("tool_call_id", ""),
                            "content": m["content"],
                        }]
                    })
                elif m["role"] == "assistant" and m.get("tool_calls"):
                    # Claude 用 assistant 角色包裹 tool_use
                    content = []
                    if m.get("content"):
                        content.append({"type": "text", "text": m["content"]})
                    for tc in m["tool_calls"]:
                        content.append({
                            "type": "tool_use",
                            "id": tc.get("id", ""),
                            "name": tc.get("function", {}).get("name", ""),
                            "input": json.loads(tc.get("function", {}).get("arguments", "{}")),
                        })
                    conv_messages.append({"role": "assistant", "content": content})
                else:
                    conv_messages.append({"role": m["role"], "content": m["content"]})

            kwargs = {
                "model": self.model,
                "messages": conv_messages,
                "max_tokens": 4096,
                "stream": True,
            }
            if system_msg:
                kwargs["system"] = system_msg
            if tools:
                kwargs["tools"] = self.adapt_tools(tools)

            # 追踪 tool use
            current_tool_id = None
            current_tool_name = None
            current_args_json = ""

            async with self.client.messages.stream(**kwargs) as stream:
                async for event in stream:
                    if event.type == "content_block_delta":
                        delta = event.delta
                        if delta.type == "text_delta":
                            yield ContentDeltaEvent(text=delta.text)
                        elif delta.type == "input_json_delta":
                            current_args_json += delta.partial_json
                            yield ToolCallDeltaEvent(
                                tool_call_id=current_tool_id or "",
                                arguments_delta=delta.partial_json,
                            )

                    elif event.type == "content_block_start":
                        if event.content_block.type == "tool_use":
                            current_tool_id = event.content_block.id
                            current_tool_name = event.content_block.name
                            current_args_json = ""
                            yield ToolCallStartEvent(
                                tool_call_id=current_tool_id,
                                name=current_tool_name,
                            )

                    elif event.type == "content_block_stop":
                        if current_tool_id and current_tool_name:
                            yield ToolCallFinishEvent(
                                tool_call_id=current_tool_id,
                                name=current_tool_name,
                                arguments=current_args_json,
                            )
                            current_tool_id = None
                            current_tool_name = None
                            current_args_json = ""

                    elif event.type == "message_stop":
                        yield FinishEvent(reason="stop")

        except Exception as e:
            logger.error(f"Claude stream error: {e}")
            yield ErrorEvent(error=str(e))


# ---------------------------------------------------------------------------
# Provider 工厂
# ---------------------------------------------------------------------------

PROVIDERS = {
    "openai": OpenAILLM,
    "claude": ClaudeLLM,
    "local": LocalLLM,
    "custom": CustomLLM,
}


def get_llm(
    provider: str = "openai",
    model_name: str | None = None,
    api_key: str | None = None,
    api_url: str | None = None,
) -> BaseLLM:
    """获取 LLM Provider 实例"""
    config = ProviderConfig(
        api_key=api_key or "",
        model=model_name or "",
        base_url=api_url or "",
    )
    provider_cls = PROVIDERS.get(provider, OpenAILLM)
    return provider_cls(config)
