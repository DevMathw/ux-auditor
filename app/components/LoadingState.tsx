"use client";

interface Props {
  currentStep: number;
}

const STEPS = [
  { icon: "↓", label: "Fetching page content" },
  { icon: "⊙", label: "Parsing HTML structure" },
  { icon: "✦", label: "Running AI analysis" },
  { icon: "≡", label: "Generating report" },
];

export default function LoadingState({ currentStep }: Props) {
  return (
    <div className="loading-state">
      <div className="spinner" />
      <div className="loading-text">Analyzing your website…</div>
      <div className="loading-steps">
        {STEPS.map((step, i) => {
          const isDone = i < currentStep;
          const isActive = i === currentStep;
          return (
            <div
              key={i}
              className={`step-item ${isDone ? "done" : ""} ${isActive ? "active" : ""}`}
            >
              <span className="step-icon">{isDone ? "✓" : step.icon}</span>
              {step.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}