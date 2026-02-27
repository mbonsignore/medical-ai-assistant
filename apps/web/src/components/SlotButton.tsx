import type { Slot } from "../types";

type Props = {
  slot: Slot;
  onBook: () => void;
};

export function SlotButton({ slot, onBook }: Props) {
  const label =
    slot.dateLocal && slot.startLocal && slot.endLocal
      ? `${slot.dateLocal} ${slot.startLocal}-${slot.endLocal}`
      : `${slot.startTs} - ${slot.endTs}`;

  return (
    <button className="slot-btn" onClick={onBook}>
      {label}
    </button>
  );
}