import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Button, Select, SelectOption, Switch, TextField } from 'material/react';

function TextFieldProbe() {
  const [value, setValue] = useState('');
  return (
    <>
      <TextField
        label="商户"
        value={value}
        onInput={(event) => setValue(event.detail.value)}
      />
      <output>{value}</output>
    </>
  );
}

function SwitchProbe() {
  const [checked, setChecked] = useState(false);
  return (
    <>
      <Switch checked={checked} onChange={(event) => setChecked(event.detail.checked)}>
        只统计已计入交易
      </Switch>
      <output>{checked ? '是' : '否'}</output>
    </>
  );
}

function SelectProbe() {
  const [value, setValue] = useState('all');
  return (
    <>
      <Select
        label="收支类型"
        value={value}
        onChange={(event) => setValue(event.detail.value ?? 'all')}
      >
        <SelectOption value="all">全部</SelectOption>
        <SelectOption value="expense">支出</SelectOption>
        <SelectOption value="income">收入</SelectOption>
      </Select>
      <output>{value}</output>
    </>
  );
}

// Material's text-field placement feature releases a window listener while
// destroying; unmount before jsdom tears down so that release has a window.
afterEach(() => cleanup());

describe('material react adapter event contract', () => {
  it('reads text field input from CustomEvent.detail.value', () => {
    const { container } = render(<TextFieldProbe />);
    const field = container.querySelector('m-text-field');
    expect(field).not.toBeNull();
    fireEvent(
      field!,
      new CustomEvent('input', { detail: { value: '盒马' }, bubbles: true, composed: true }),
    );
    expect(screen.getByText('盒马')).toBeInTheDocument();
  });

  it('reads switch state from CustomEvent.detail.checked', () => {
    const { container } = render(<SwitchProbe />);
    const control = container.querySelector('m-switch');
    expect(control).not.toBeNull();
    fireEvent(
      control!,
      new CustomEvent('change', {
        detail: { checked: true, value: true, valueAttribute: 'on', nativeEvent: undefined },
        bubbles: true,
        composed: true,
      }),
    );
    expect(screen.getByText('是')).toBeInTheDocument();
  });

  it('reads select value from CustomEvent.detail.value', () => {
    const { container } = render(<SelectProbe />);
    const control = container.querySelector('m-select');
    expect(control).not.toBeNull();
    fireEvent(
      control!,
      new CustomEvent('change', { detail: { value: 'expense' }, bubbles: true, composed: true }),
    );
    expect(screen.getByText('expense')).toBeInTheDocument();
  });

  it('forwards host clicks on material buttons to React handlers', () => {
    const onClick = vi.fn();
    const { container } = render(<Button onClick={onClick}>保存</Button>);
    const button = container.querySelector('m-button');
    expect(button).not.toBeNull();
    fireEvent.click(button!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
