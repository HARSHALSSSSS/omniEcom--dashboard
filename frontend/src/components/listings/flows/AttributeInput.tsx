import type { StudioAttribute } from "@/types/listingStudio";

interface AttributeInputProps {
  id: string;
  attribute: StudioAttribute;
  value: string;
  onChange: (value: string) => void;
  /** tailwind classes of the field (the blocker screen and the quick view size it differently) */
  className: string;
}

/** the field for one category attribute: a list when the marketplace allows fixed values, yes/no for flags, free text otherwise */
export function AttributeInput({ id, attribute, value, onChange, className }: AttributeInputProps) {
  if (attribute.allowedValues && attribute.allowedValues.length > 0) {
    return (
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} required className={className}>
        <option value="">Select {attribute.label.toLowerCase()}</option>
        {attribute.allowedValues.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    );
  }
  if (attribute.type === "boolean") {
    return (
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} required className={className}>
        <option value="">Select</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }
  return (
    <input
      id={id}
      type={attribute.type === "number" ? "number" : "text"}
      step={attribute.type === "number" ? "any" : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={attribute.maxLength ?? undefined}
      placeholder={`Enter ${attribute.label.toLowerCase()}`}
      required
      className={className}
    />
  );
}
