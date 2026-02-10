import type { FC } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import ChevronDownIcon from '@untitled-ui/icons-react/build/esm/ChevronDown';
import { Button, ButtonGroup, MenuItem, Popover } from '@mui/material';

interface Option {
  label: string;
  value: string;
}

interface TaskStatusProps {
  onChange?: (value: string) => void;
  options?: Option[];
  value: string;
}

export const TaskStatus: FC<TaskStatusProps> = (props) => {
  const { onChange, options = [], value } = props;
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState<boolean>(false);
  const [currentOption, setCurrentOption] = useState<Option | undefined>(() => {
    return options.find((option) => option.value === value);
  });

  useEffect(
    () => {
      const option = options.find((option) => option.value === value);
      setCurrentOption(option);
    },
    [options, value]
  );

  const handleOptionConfirm = useCallback(
    (): void => {
      if (!currentOption) {
        return;
      }

      onChange?.(currentOption.value);
    },
    [currentOption, onChange]
  );

  const handleOptionSelect = useCallback(
    (value: string): void => {
      const option = options.find((option) => option.value === value);
      setCurrentOption(option);
      setOpen(false);
    },
    [options]
  );

  const handleMenuToggle = useCallback(
    (): void => {
      setOpen((prevState) => !prevState);
    },
    []
  );

  const handleMenuClose = useCallback(
    (): void => {
      setOpen(false);
    },
    []
  );

  return (
    <>
      <ButtonGroup
        ref={anchorRef}
        variant="contained"
        size="small"
      >
        <Button onClick={handleOptionConfirm}>
          Submit as {currentOption?.label}
        </Button>
        <Button
          size="small"
          onClick={handleMenuToggle}
        >
          <ChevronDownIcon />
        </Button>
      </ButtonGroup>
      <Popover
        anchorEl={anchorRef.current}
        disableScrollLock
        onClose={handleMenuClose}
        open={open}
        anchorOrigin={{
          horizontal: 'right',
          vertical: 'bottom'
        }}
        transformOrigin={{
          horizontal: 'right',
          vertical: 'top'
        }}
      >
        {options.map((option) => (
          <MenuItem
            key={option.value}
            selected={option.value === value}
            onClick={() => handleOptionSelect(option.value)}
          >
            {option.label}
          </MenuItem>
        ))}
      </Popover>
    </>
  );
};
