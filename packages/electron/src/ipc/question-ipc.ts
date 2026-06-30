import { ipcMain } from "electron"
import { answerQuestion, getPendingQuestions } from "@mira/core/tools/interaction/question"

export function registerQuestionIPC(): void {
  ipcMain.handle("question:answer", (_, questionId: string, answer: string) => {
    return answerQuestion(questionId, answer)
  })

  ipcMain.handle("question:listPending", () => {
    return getPendingQuestions()
  })
}

