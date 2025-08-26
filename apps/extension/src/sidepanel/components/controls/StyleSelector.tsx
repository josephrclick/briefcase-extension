import React from "react";

interface StyleSelectorProps {
  value: "plain" | "bullets" | "executive";
  onChange: (style: "plain" | "bullets" | "executive") => void;
  disabled?: boolean;
}

const StyleSelector: React.FC<StyleSelectorProps> = ({ value, onChange, disabled }) => {
  return (
    <div className="control-field">
      <label htmlFor="style-select">Style</label>
      <select
        id="style-select"
        value={value}
        onChange={(e) => onChange(e.target.value as "plain" | "bullets" | "executive")}
        disabled={disabled}
      >
        <option value="plain">Plain</option>
        <option value="bullets">Bullets</option>
        <option value="executive">Executive</option>
      </select>
    </div>
  );
};

export default StyleSelector;
