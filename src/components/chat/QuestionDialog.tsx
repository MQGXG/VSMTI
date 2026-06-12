import { useState } from "react";
import { HelpCircle, Send } from "lucide-react";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-neutral-700 w-full max-w-md mx-4 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-full bg-emerald-100 dark:bg-emerald-500/10 shrink-0">
            <HelpCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Agent 提问</h3>
            <p className="text-sm text-gray-600 dark:text-neutral-400">{question}</p>
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
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-gray-200 dark:border-neutral-700 hover:border-gray-300 dark:hover:border-neutral-600 text-gray-700 dark:text-neutral-300"
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
              className="w-full px-4 py-2.5 rounded-xl text-sm border border-gray-200 dark:border-neutral-700 bg-transparent focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-500 text-gray-900 dark:text-neutral-100 placeholder-gray-400"
            />
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!selected && !customAnswer.trim()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 dark:disabled:bg-neutral-700 text-white text-sm font-medium transition-colors"
        >
          <Send className="w-4 h-4" />
          提交回答
        </button>
      </div>
    </div>
  );
}
