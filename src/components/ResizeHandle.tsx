interface Props {
  onMouseDown: (e: React.MouseEvent) => void;
}

export default function ResizeHandle({ onMouseDown }: Props) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="group relative w-0 shrink-0 cursor-col-resize z-20"
    >
      <div className="absolute inset-y-0 -left-px w-[3px] bg-transparent group-hover:bg-accent/50 transition-colors" />
    </div>
  );
}
