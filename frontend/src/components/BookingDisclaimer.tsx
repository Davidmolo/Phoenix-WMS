"use client";

export function BookingDisclaimer({
  hours = "8:00 AM – 6:00 PM",
  slotMinutes = 45,
  bufferMinutes = 15,
  className,
}: {
  hours?: string;
  slotMinutes?: number;
  bufferMinutes?: number;
  className?: string;
}) {
  return (
    <p className={`m-0 text-xs leading-relaxed text-muted ${className ?? ""}`}>
      Warehouse hours {hours}. Appointments are {slotMinutes}-minute slots. Please allow about{" "}
      {bufferMinutes} minutes early or late for traffic — we keep that buffer on the dock.
      Cross-dock uses both doors; trailer rework and drop & store use one.
    </p>
  );
}
