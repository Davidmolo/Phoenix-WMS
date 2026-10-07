"use client";

export function BookingDisclaimer({
  hours = "8:00 AM – 6:00 PM",
  bufferMinutes = 15,
  className,
}: {
  hours?: string;
  /** @deprecated Prefer per-service copy below; kept for call-site compatibility */
  slotMinutes?: number;
  bufferMinutes?: number;
  className?: string;
}) {
  return (
    <p className={`m-0 text-xs leading-relaxed text-muted ${className ?? ""}`}>
      Warehouse hours {hours}. Per Cesar / Darya: Crossdock and Drop &amp; Store are{" "}
      <strong className="text-navy">45 minutes</strong>; Trailer Rework is{" "}
      <strong className="text-navy">1 hour</strong>. Please allow about {bufferMinutes} minutes
      early or late for traffic. Crossdock uses both doors; trailer rework and drop &amp; store use
      one.
    </p>
  );
}

/** Visit length for a booking service type (matches backend Cesar/Darya rules). */
export function durationMinutesForService(serviceType: string): number {
  if (serviceType === "trailer_rework") return 60;
  return 45;
}

export function durationLabelForService(serviceType: string): string {
  const mins = durationMinutesForService(serviceType);
  return mins === 60 ? "1 hour" : "45 min";
}
