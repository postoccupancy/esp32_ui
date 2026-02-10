import type { FC } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Chip, IconButton, Menu, MenuItem, Stack, SvgIcon } from '@mui/material';
import PlusIcon from '@untitled-ui/icons-react/build/esm/Plus';
import PropTypes from 'prop-types';

const options: string[] = [
  'Business',
  'Planning',
  'Frontend',
  'Design'
];

interface TaskLabelsProps {
  labels?: string[];
  onChange?: (labels: string[]) => void;
}

export const TaskLabels: FC<TaskLabelsProps> = (props) => {
  const { labels = [], onChange } = props;
  const menuRef = useRef<HTMLButtonElement | null>(null);
  const [openMenu, setOpenMenu] = useState<boolean>(false);
  const availableOptions = useMemo(() => {
    return options.filter((option) => !labels.includes(option));
  }, [labels]);

  const handleMenuOpen = useCallback(
    (): void => {
      setOpenMenu(true);
    },
    []
  );

  const handleMenuClose = useCallback(
    (): void => {
      setOpenMenu(false);
    },
    []
  );

  const handleDelete = useCallback(
    (label: string) => {
      const newLabels = labels.filter((item) => item !== label);

      onChange?.(newLabels);
    },
    [labels, onChange]
  );

  const handleToggle = useCallback(
    (label: string) => {
      let newLabels: string[];

      const found = labels.find((item) => item === label);

      if (found) {
        newLabels = labels.filter((item) => item !== label);
      } else {
        newLabels = [...labels, label];
      }

      setOpenMenu(false);
      onChange?.(newLabels);
    },
    [labels, onChange]
  );

  const canAdd = availableOptions.length > 0;

  return (
    <>
      <Stack
        alignItems="center"
        direction="row"
        flexWrap="wrap"
        gap={1}
      >
        {labels.map((label) => (
          <Chip
            key={label}
            label={label}
            onDelete={() => handleDelete(label)}
            size="small"
          />
        ))}
        <IconButton
          onClick={handleMenuOpen}
          ref={menuRef}
          disabled={!canAdd}
        >
          <SvgIcon fontSize="small">
            <PlusIcon />
          </SvgIcon>
        </IconButton>
      </Stack>
      <Menu
        anchorEl={menuRef.current}
        anchorOrigin={{
          horizontal: 'right',
          vertical: 'bottom'
        }}
        onClose={handleMenuClose}
        open={openMenu}
        transformOrigin={{
          horizontal: 'right',
          vertical: 'top'
        }}
      >
        {availableOptions.map((option) => (
          <MenuItem
            key={option}
            onClick={() => handleToggle(option)}
          >
            {option}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

TaskLabels.propTypes = {
  labels: PropTypes.arrayOf(PropTypes.string.isRequired),
  onChange: PropTypes.func
};
