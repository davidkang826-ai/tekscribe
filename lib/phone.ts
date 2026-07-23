/** US-style (###) ###-#### when the number has 10 digits (or 11 starting with
 *  1); otherwise the trimmed input, unchanged. */
export function formatPhone(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  const digits = s.replace(/\D/g, "");
  const ten =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) return s;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}
