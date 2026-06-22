import { ipcMain } from "electron"
import { scanSkills } from "../agent-core/skill/skill-loader"

export function registerSkillIPC(): void {
  ipcMain.handle("skill:listSkills", () => {
    return scanSkills().map((s) => ({
      name: s.name,
      description: s.description,
      category: s.category,
    }))
  })
}
