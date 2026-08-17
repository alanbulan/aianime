// Copyright (c) 2026 AI anime
export interface VideoHumanReviewSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function VideoHumanReviewSwitch({
  checked,
  onChange,
}: VideoHumanReviewSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-ui-tooltip="素材含真实人脸时开启，可能增加审核时间，不保证通过。"
      onClick={(event) => {
        event.stopPropagation();
        onChange(!checked);
      }}
      className={`nodrag inline-flex h-7 items-center gap-1.5 rounded px-1 text-xs font-medium transition-colors ${
        checked
          ? "text-text-dark"
          : "text-text-dark/72 hover:text-text-dark"
      }`}
    >
      <span>真人验证</span>
      <span
        className={`relative inline-flex h-3.5 w-6 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-input"
        }`}
      >
        <span
          className={`inline-block h-2.5 w-2.5 transform rounded-full bg-card shadow-sm transition-transform ${
            checked ? "translate-x-3" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}
