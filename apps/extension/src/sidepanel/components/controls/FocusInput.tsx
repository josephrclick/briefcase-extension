import React from "react";

interface FocusInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const FocusInput: React.FC<FocusInputProps> = ({ value, onChange, disabled, placeholder }) => {
  return (
    <div className="control-field control-field--full">
      <label htmlFor="focus-input">Focus (Optional)</label>
      <input
        id="focus-input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
      />
    </div>
  );
};

export default FocusInput;
