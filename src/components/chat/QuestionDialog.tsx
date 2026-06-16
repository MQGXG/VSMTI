import { useState } from "react";
import { HelpCircle, Send } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

interface Props {
  question: string;
  options: string[];
  onSubmit: (answer: string) => void;
}

export function QuestionDialog({ question, options, onSubmit }: Props) {
  const [customAnswer, setCustomAnswer] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const handleSubmit = () => {
    if (selected) {
      onSubmit(selected);
    } else if (customAnswer.trim()) {
      onSubmit(customAnswer.trim());
    }
  };

  return (
    <Modal open={true} onClose={() => onSubmit("")} maxWidth="max-w-md">
      <div className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-full bg-accent-500/20 shrink-0">
            <HelpCircle className="w-5 h-5 text-accent-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Agent 提问</h3>
            <p className="text-sm text-neutral-400">{question}</p>
          </div>
        </div>

        <div className="space-y-2">
          {options.map((opt, i) => (
            <button
              key={i}
              onClick={() => {
                setSelected(opt);
                setCustomAnswer("");
              }}
              className={`w-full text-left px-4 py-2.5 rounded-xl text-sm border transition-all ${
                selected === opt
                  ? "border-accent-500/50 bg-accent-500/10 text-accent-300"
                  : "border-glass-border hover:border-accent-500/30 text-neutral-300"
              }`}
            >
              {opt}
            </button>
          ))}

          <div className="relative">
            <input
              type="text"
              value={customAnswer}
              onChange={(e) => {
                setCustomAnswer(e.target.value);
                setSelected(null);
              }}
              placeholder="输入自定义回答..."
              className="w-full px-4 py-2.5 rounded-xl text-sm border border-glass-border bg-transparent focus:outline-none focus:border-accent-500/50 text-neutral-900 dark:text-neutral-100 placeholder-neutral-500"
            />
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!selected && !customAnswer.trim()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl btn-gradient text-white text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" />
          提交回答
        </button>
      </div>
    </Modal>
  );
}
