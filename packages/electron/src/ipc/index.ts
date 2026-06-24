import { registerAgentIPC } from "./agent-ipc"
import { registerSessionIPC } from "./session-ipc"
import { registerConfigIPC } from "./config-ipc"
import { registerTaskIPC } from "./task-ipc"
import { registerSubagentIPC } from "./subagent-ipc"
import { registerGoalIPC } from "./goal-ipc"
import { registerDreamIPC } from "./dream-ipc"
import { registerComposeIPC } from "./compose-ipc"
import { registerSkillIPC } from "./skill-ipc"
import { registerQuestionIPC } from "./question-ipc"
import { setupDefaultHooks } from "@mira/core/hooks-setup"
import { cronScheduler } from "@mira/core/cron-scheduler"

export function registerAgentIPCHandlers(): void {
  setupDefaultHooks()
  cronScheduler.start()

  registerAgentIPC()
  registerSessionIPC()
  registerConfigIPC()
  registerTaskIPC()
  registerSubagentIPC()
  registerGoalIPC()
  registerDreamIPC()
  registerComposeIPC()
  registerSkillIPC()
  registerQuestionIPC()
}
