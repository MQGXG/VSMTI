import json
from app.core.llm import BaseLLM
from app.tools.registry import ToolRegistry
from app.prompts.system import SYSTEM_PROMPT


class Agent:
    def __init__(self, llm: BaseLLM, tools: ToolRegistry, max_iterations: int = 10):
        self.llm = llm
        self.tools = tools
        self.max_iterations = max_iterations

    async def run(self, user_message: str, history: list = None):
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            *(history or []),
            {"role": "user", "content": user_message},
        ]

        for i in range(self.max_iterations):
            full_content = ""
            tool_calls = []

            async for event in self.llm.chat_stream(messages, tools=self.tools.all_schemas()):
                if event["type"] == "content":
                    full_content += event["text"]
                    yield {"type": "content", "text": event["text"]}
                elif event["type"] == "tool_calls":
                    tool_calls.extend(event["data"])

            if not tool_calls:
                return

            messages.append({
                "role": "assistant",
                "content": full_content or None,
                "tool_calls": tool_calls,
            })

            for tc in tool_calls:
                func_name = tc.function.name
                func_args = json.loads(tc.function.arguments)

                yield {"type": "tool_start", "name": func_name, "args": func_args}

                result = await self.tools.execute(func_name, func_args)

                yield {"type": "tool_result", "name": func_name, "output": result.output}

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result.output,
                })
