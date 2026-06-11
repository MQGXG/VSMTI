from abc import ABC, abstractmethod
from openai import AsyncOpenAI
import anthropic
from app.config import settings


class BaseLLM(ABC):
    @abstractmethod
    async def chat_stream(self, messages, tools=None):
        pass


class OpenAILLM(BaseLLM):
    def __init__(self, api_key: str = "", model: str = "", base_url: str = ""):
        kwargs = {"api_key": api_key or settings.openai_api_key}
        if base_url:
            kwargs["base_url"] = base_url
        self.client = AsyncOpenAI(**kwargs)
        self.model = model or settings.openai_model

    async def chat_stream(self, messages, tools=None):
        kwargs = {"model": self.model, "messages": messages, "stream": True}
        if tools:
            kwargs["tools"] = tools
        stream = await self.client.chat.completions.create(**kwargs)
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                yield {"type": "content", "text": delta.content}
            if delta.tool_calls:
                yield {"type": "tool_calls", "data": delta.tool_calls}


class ClaudeLLM(BaseLLM):
    def __init__(self, api_key: str = "", model: str = ""):
        self.client = anthropic.AsyncAnthropic(api_key=api_key or settings.anthropic_api_key)
        self.model = model or settings.anthropic_model

    async def chat_stream(self, messages, tools=None):
        system_msg = ""
        conv_messages = []
        for m in messages:
            if m["role"] == "system":
                system_msg = m["content"]
            else:
                conv_messages.append({"role": m["role"], "content": m["content"]})

        kwargs = {"model": self.model, "messages": conv_messages, "max_tokens": 4096, "stream": True}
        if system_msg:
            kwargs["system"] = system_msg
        if tools:
            kwargs["tools"] = [
                {"name": t["function"]["name"], "description": t["function"]["description"],
                 "input_schema": t["function"]["parameters"]}
                for t in tools
            ]
        async with self.client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield {"type": "content", "text": text}


class LocalLLM(BaseLLM):
    def __init__(self, base_url: str = "", model: str = ""):
        self.client = AsyncOpenAI(base_url=(base_url or settings.ollama_base_url) + "/v1")
        self.model = model or "llama3.1"

    async def chat_stream(self, messages, tools=None):
        kwargs = {"model": self.model, "messages": messages, "stream": True}
        if tools:
            kwargs["tools"] = tools
        stream = await self.client.chat.completions.create(**kwargs)
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                yield {"type": "content", "text": delta.content}
            if delta.tool_calls:
                yield {"type": "tool_calls", "data": delta.tool_calls}


class CustomLLM(BaseLLM):
    def __init__(self, api_key: str = "", model: str = "", base_url: str = ""):
        self.client = AsyncOpenAI(api_key=api_key or settings.openai_api_key, base_url=base_url)
        self.model = model or "custom"

    async def chat_stream(self, messages, tools=None):
        kwargs = {"model": self.model, "messages": messages, "stream": True}
        if tools:
            kwargs["tools"] = tools
        stream = await self.client.chat.completions.create(**kwargs)
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                yield {"type": "content", "text": delta.content}
            if delta.tool_calls:
                yield {"type": "tool_calls", "data": delta.tool_calls}


def get_llm(provider: str = "openai", model_name: str = None, api_key: str = None, api_url: str = None) -> BaseLLM:
    model_name = model_name or ""
    api_key = api_key or ""
    api_url = api_url or ""

    if provider == "openai":
        return OpenAILLM(api_key=api_key, model=model_name, base_url=api_url)
    elif provider == "claude":
        return ClaudeLLM(api_key=api_key, model=model_name)
    elif provider == "local":
        return LocalLLM(base_url=api_url, model=model_name)
    elif provider == "custom":
        return CustomLLM(api_key=api_key, model=model_name, base_url=api_url)
    return OpenAILLM(api_key=api_key, model=model_name, base_url=api_url)
