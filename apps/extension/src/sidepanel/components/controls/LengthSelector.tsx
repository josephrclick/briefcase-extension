import React from "react";

interface LengthSelectorProps {
  value: "brief" | "medium" | "verbose";
  onChange: (length: "brief" | "medium" | "verbose") => void;
  disabled?: boolean;
}

const LengthSelector: React.FC<LengthSelectorProps> = ({ value, onChange, disabled }) => {
  return (
    <div className="control-field">
      <label htmlFor="length-select">Length</label>
      <select
        id="length-select"
        value={value}
        onChange={(e) => onChange(e.target.value as "brief" | "medium" | "verbose")}
        disabled={disabled}
      >
        <option value="brief">Brief</option>
        <option value="medium">Medium</option>
        <option value="verbose">Verbose</option>
      </select>
    </div>
  );
};

export default LengthSelector;
