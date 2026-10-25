import { useEffect, useState } from "react";
import { todayLocalDate } from "@/lib/dates";

/** Due-date state that resets to today's local date each time the modal opens. */
export function useDefaultDueDate(isOpen: boolean) {
  const [dueDate, setDueDate] = useState(() => todayLocalDate());

  useEffect(() => {
    if (isOpen) setDueDate(todayLocalDate());
  }, [isOpen]);

  return [dueDate, setDueDate] as const;
}
