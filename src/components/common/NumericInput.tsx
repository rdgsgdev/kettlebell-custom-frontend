import React, { useState, useEffect, useRef } from 'react';
import { TextInput, TextInputProps } from 'react-native';

interface Props extends Omit<TextInputProps, 'value' | 'onChangeText' | 'keyboardType' | 'onBlur'> {
  value: number;
  onCommit: (n: number) => void;
  /** Minimum valid value (default 0) */
  min?: number;
  isFloat?: boolean;
  onBlur?: TextInputProps['onBlur'];
}

/**
 * A TextInput that displays a number but allows the field to be fully
 * cleared while the user is typing. Commits valid values immediately via
 * `onCommit`; restores the last valid value on blur if the field is empty
 * or invalid.
 */
export default function NumericInput({
  value,
  onCommit,
  min = 0,
  isFloat = false,
  onBlur,
  ...rest
}: Props) {
  const [text, setText] = useState(String(value));
  const prevValueRef = useRef(value);

  // Sync display if the value was changed externally (e.g. parent reset)
  useEffect(() => {
    if (prevValueRef.current !== value) {
      prevValueRef.current = value;
      setText(String(value));
    }
  }, [value]);

  const parse = (v: string) => (isFloat ? parseFloat(v) : parseInt(v, 10));

  const handleChange = (v: string) => {
    setText(v);
    const n = parse(v);
    if (!isNaN(n) && n >= min) {
      prevValueRef.current = n;
      onCommit(n);
    }
  };

  const handleBlur: TextInputProps['onBlur'] = (e) => {
    const n = parse(text);
    if (isNaN(n) || n < min) {
      setText(String(value));
      prevValueRef.current = value;
    }
    onBlur?.(e);
  };

  return (
    <TextInput
      {...rest}
      value={text}
      onChangeText={handleChange}
      onBlur={handleBlur}
      keyboardType={isFloat ? 'decimal-pad' : 'number-pad'}
    />
  );
}
