import React, { useEffect, useState } from 'react';
import {
    Box,
    Button,
    FormControl,
    IconButton,
    MenuItem,
    Select,
    Snackbar,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import {
    Delete as DeleteIcon,
    Add as AddIcon,
    Clear as ClearIcon,
    InfoOutlined as InfoOutlinedIcon,
    SearchOutlined as SearchOutlinedIcon,
} from '@mui/icons-material';
import {
    I18n,
    DialogSelectID,
    type IobTheme,
    type ThemeName,
    type ThemeType,
    type AdminConnection,
} from '@iobroker/adapter-react-v5';

export interface ResidentEntry {
    name: string;
    id: string;
    icon: string;
    yahkaInstanceId: string;
    foreignPresenceObjectId?: string;
    foreignWayhomeObjectId?: string;
}

interface ResidentTableProps {
    type: 'roomie' | 'guest' | 'pet';
    residents: ResidentEntry[];
    onChange: (residents: ResidentEntry[]) => void;
    socket: AdminConnection;
    theme: IobTheme;
    themeType: ThemeType;
    themeName: ThemeName;
}

const hCellSx = {
    fontWeight: 700,
    textTransform: 'none',
    borderBottom: '2px solid',
    borderColor: 'primary.main',
} as const;

const HeaderCell: React.FC<{
    label: string;
    hint?: string;
    required?: boolean;
    width?: number;
    minWidth?: number;
    align?: 'left' | 'center' | 'right';
}> = ({ label, hint, required, width, minWidth, align }) => (
    <TableCell
        align={align}
        sx={{ ...hCellSx, width, minWidth }}
    >
        {hint || required ? (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                {label}
                {required && (
                    <Box
                        component="span"
                        sx={{ color: 'error.main', lineHeight: 1 }}
                    >
                        *
                    </Box>
                )}
                {hint && (
                    <Tooltip
                        title={hint}
                        placement="top"
                        arrow
                    >
                        <InfoOutlinedIcon sx={{ fontSize: 14, opacity: 0.55, cursor: 'help', flexShrink: 0 }} />
                    </Tooltip>
                )}
            </Box>
        ) : (
            label
        )}
    </TableCell>
);

const isValidDeviceName = (id: string): boolean => !id || /^[a-zA-Z0-9_]+$/.test(id);
const isValidEmoji = (icon: string): boolean => !icon || [...new Intl.Segmenter().segment(icon)].length === 1;

const ResidentTable: React.FC<ResidentTableProps> = ({
    type,
    residents,
    onChange,
    socket,
    theme,
    themeType,
    themeName,
}) => {
    const isPet = type === 'pet';

    const addLabel = { roomie: I18n.t('Add roomie'), guest: I18n.t('Add guest'), pet: I18n.t('Add pet') }[type];
    const emptyLabel = {
        roomie: I18n.t('No roomies configured yet.'),
        guest: I18n.t('No guests configured yet.'),
        pet: I18n.t('No pets configured yet.'),
    }[type];

    type SelectField = 'foreignPresenceObjectId' | 'foreignWayhomeObjectId';
    const [selectDialog, setSelectDialog] = useState<{ rowIndex: number; field: SelectField } | null>(null);

    const [yahkaInstances, setYahkaInstances] = useState<string[] | null>(null);
    useEffect(() => {
        socket
            .getAdapterInstances('yahka')
            .then(instances => {
                setYahkaInstances(instances.map((inst: { _id: string }) => inst._id.replace(/^system\.adapter\./, '')));
            })
            .catch(() => setYahkaInstances([]));
    }, [socket]);

    const handleAdd = (): void => {
        const newEntry: ResidentEntry = {
            name: '',
            id: '',
            icon: '',
            yahkaInstanceId: '',
            ...(isPet ? {} : { foreignPresenceObjectId: '', foreignWayhomeObjectId: '' }),
        };
        onChange([...residents, newEntry]);
    };

    const [undoSnackbar, setUndoSnackbar] = useState<{ open: boolean; before: ResidentEntry[] }>({
        open: false,
        before: [],
    });

    const handleDelete = (index: number): void => {
        setUndoSnackbar({ open: true, before: [...residents] });
        onChange(residents.filter((_, i) => i !== index));
    };

    const handleUndoClose = (_event: React.SyntheticEvent | Event, reason?: string): void => {
        if (reason === 'clickaway') {
            return;
        }
        setUndoSnackbar(s => ({ ...s, open: false }));
    };

    const handleUndo = (): void => {
        onChange(undoSnackbar.before);
        setUndoSnackbar(s => ({ ...s, open: false }));
    };

    const handleChange = (index: number, field: keyof ResidentEntry, value: string): void => {
        const updated = residents.map((r, i) => (i === index ? { ...r, [field]: value } : r));
        onChange(updated);
    };

    return (
        <Box>
            <Box sx={{ mb: 1 }}>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleAdd}
                    size="small"
                >
                    {addLabel}
                </Button>
            </Box>
            <Box sx={{ overflowX: 'auto' }}>
                <Table
                    size="small"
                    stickyHeader
                >
                    <TableHead>
                        <TableRow>
                            <HeaderCell
                                label={I18n.t('#')}
                                width={50}
                                align="center"
                            />
                            <HeaderCell
                                label={I18n.t('Display Name')}
                                required
                                minWidth={160}
                            />
                            <HeaderCell
                                label={I18n.t('Residents Device Name')}
                                hint={I18n.t('Optional, otherwise deducted from Display Name')}
                                minWidth={180}
                            />
                            <HeaderCell
                                label={I18n.t('Icon')}
                                hint={I18n.t('Optional custom emoji')}
                                width={90}
                            />
                            <HeaderCell
                                label={I18n.t('Yahka instance')}
                                hint={I18n.t('for Homekit support')}
                                minWidth={160}
                            />
                            {!isPet && (
                                <>
                                    <HeaderCell
                                        label={I18n.t('Foreign Presence Datapoints')}
                                        hint="boolean, 0/1 · JSON: entry / presence / present"
                                        minWidth={160}
                                    />
                                    <HeaderCell
                                        label={I18n.t('Foreign Way Home Datapoints')}
                                        hint="boolean, 0/1 · JSON: entry / presence / present"
                                        minWidth={160}
                                    />
                                </>
                            )}
                            <TableCell sx={hCellSx} />
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {residents.map((resident, index) => (
                            <TableRow
                                key={index}
                                hover
                                sx={{ backgroundColor: index % 2 !== 0 ? 'action.hover' : 'inherit' }}
                            >
                                <TableCell align="center">{index + 1}</TableCell>
                                <TableCell>
                                    <TextField
                                        variant="standard"
                                        value={resident.name}
                                        onChange={e => {
                                            const newName = e.target.value;
                                            const updated = residents.map((r, i) => {
                                                if (i !== index) {
                                                    return r;
                                                }
                                                const entry = { ...r, name: newName };
                                                const currentSlug = r.name
                                                    .toLowerCase()
                                                    .replace(/\s+/g, '_')
                                                    .replace(/[^a-z0-9_]/g, '');
                                                if (!r.id || r.id === currentSlug) {
                                                    entry.id = newName
                                                        .toLowerCase()
                                                        .replace(/\s+/g, '_')
                                                        .replace(/[^a-z0-9_]/g, '');
                                                }
                                                return entry;
                                            });
                                            onChange(updated);
                                        }}
                                        fullWidth
                                        size="small"
                                        placeholder="e.g. Alice"
                                        error={!resident.name?.trim()}
                                    />
                                </TableCell>
                                <TableCell>
                                    <TextField
                                        variant="standard"
                                        value={resident.id}
                                        onChange={e => handleChange(index, 'id', e.target.value)}
                                        fullWidth
                                        size="small"
                                        placeholder="e.g. alice"
                                        error={
                                            !isValidDeviceName(resident.id) ||
                                            (Boolean(resident.id) &&
                                                residents.some((r, j) => j !== index && r.id === resident.id))
                                        }
                                        helperText={
                                            !isValidDeviceName(resident.id)
                                                ? I18n.t('Only letters, digits and underscores allowed')
                                                : Boolean(resident.id) &&
                                                    residents.some((r, j) => j !== index && r.id === resident.id)
                                                  ? I18n.t('This device name is already used')
                                                  : undefined
                                        }
                                    />
                                </TableCell>
                                <TableCell>
                                    <TextField
                                        variant="standard"
                                        value={resident.icon}
                                        onChange={e => handleChange(index, 'icon', e.target.value)}
                                        fullWidth
                                        size="small"
                                        placeholder={type === 'guest' ? '🧳' : type === 'pet' ? '🐶' : '🧑'}
                                        error={!isValidEmoji(resident.icon)}
                                    />
                                </TableCell>
                                <TableCell>
                                    {yahkaInstances !== null && yahkaInstances.length > 0 ? (
                                        <FormControl
                                            variant="standard"
                                            fullWidth
                                            size="small"
                                        >
                                            <Select
                                                value={resident.yahkaInstanceId ?? ''}
                                                onChange={e => handleChange(index, 'yahkaInstanceId', e.target.value)}
                                                displayEmpty
                                            >
                                                <MenuItem value="">
                                                    <em>{I18n.t('None')}</em>
                                                </MenuItem>
                                                {yahkaInstances.map(inst => (
                                                    <MenuItem
                                                        key={inst}
                                                        value={inst}
                                                    >
                                                        {inst}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    ) : (
                                        <TextField
                                            variant="standard"
                                            value={resident.yahkaInstanceId ?? ''}
                                            onChange={e => handleChange(index, 'yahkaInstanceId', e.target.value)}
                                            fullWidth
                                            size="small"
                                            placeholder="e.g. yahka.0"
                                            disabled={yahkaInstances !== null && yahkaInstances.length === 0}
                                            helperText={
                                                yahkaInstances !== null && yahkaInstances.length === 0
                                                    ? I18n.t('No Yahka instances found')
                                                    : undefined
                                            }
                                        />
                                    )}
                                </TableCell>
                                {!isPet && (
                                    <>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <TextField
                                                    variant="standard"
                                                    value={resident.foreignPresenceObjectId ?? ''}
                                                    onChange={e =>
                                                        handleChange(index, 'foreignPresenceObjectId', e.target.value)
                                                    }
                                                    fullWidth
                                                    size="small"
                                                    placeholder="e.g. alias.0.alice.presence"
                                                />
                                                {resident.foreignPresenceObjectId ? (
                                                    <Tooltip title={I18n.t('Clear')}>
                                                        <IconButton
                                                            size="small"
                                                            onClick={() =>
                                                                handleChange(index, 'foreignPresenceObjectId', '')
                                                            }
                                                        >
                                                            <ClearIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                ) : null}
                                                <Tooltip title={I18n.t('Select ID')}>
                                                    <IconButton
                                                        size="small"
                                                        onClick={() =>
                                                            setSelectDialog({
                                                                rowIndex: index,
                                                                field: 'foreignPresenceObjectId',
                                                            })
                                                        }
                                                    >
                                                        <SearchOutlinedIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <TextField
                                                    variant="standard"
                                                    value={resident.foreignWayhomeObjectId ?? ''}
                                                    onChange={e =>
                                                        handleChange(index, 'foreignWayhomeObjectId', e.target.value)
                                                    }
                                                    fullWidth
                                                    size="small"
                                                    placeholder="e.g. alias.0.alice.wayhome"
                                                />
                                                {resident.foreignWayhomeObjectId ? (
                                                    <Tooltip title={I18n.t('Clear')}>
                                                        <IconButton
                                                            size="small"
                                                            onClick={() =>
                                                                handleChange(index, 'foreignWayhomeObjectId', '')
                                                            }
                                                        >
                                                            <ClearIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                ) : null}
                                                <Tooltip title={I18n.t('Select ID')}>
                                                    <IconButton
                                                        size="small"
                                                        onClick={() =>
                                                            setSelectDialog({
                                                                rowIndex: index,
                                                                field: 'foreignWayhomeObjectId',
                                                            })
                                                        }
                                                    >
                                                        <SearchOutlinedIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </Box>
                                        </TableCell>
                                    </>
                                )}
                                <TableCell align="center">
                                    <Tooltip title={I18n.t('Delete')}>
                                        <IconButton
                                            size="small"
                                            onClick={() => handleDelete(index)}
                                            color="error"
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </TableCell>
                            </TableRow>
                        ))}
                        {residents.length === 0 && (
                            <TableRow>
                                <TableCell
                                    colSpan={isPet ? 6 : 8}
                                    align="center"
                                    sx={{ py: 4, color: 'text.secondary', fontStyle: 'italic' }}
                                >
                                    <Typography variant="body2">{emptyLabel}</Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Box>
            {selectDialog !== null && (
                <DialogSelectID
                    key={`${selectDialog.rowIndex}-${selectDialog.field}`}
                    socket={socket}
                    theme={theme}
                    themeType={themeType}
                    themeName={themeName}
                    dialogName="residents-select-id"
                    title={I18n.t('Select ID')}
                    selected={residents[selectDialog.rowIndex]?.[selectDialog.field] ?? ''}
                    filterFunc={obj =>
                        obj.type === 'state' &&
                        ['boolean', 'number', 'string'].includes((obj.common as { type?: string })?.type ?? '')
                    }
                    onClose={() => setSelectDialog(null)}
                    onOk={selected => {
                        if (typeof selected === 'string' && selected) {
                            handleChange(selectDialog.rowIndex, selectDialog.field, selected);
                        }
                        setSelectDialog(null);
                    }}
                />
            )}
            <Snackbar
                open={undoSnackbar.open}
                autoHideDuration={5000}
                onClose={handleUndoClose}
                message={I18n.t('Entry deleted')}
                action={
                    <Button
                        color="inherit"
                        size="small"
                        onClick={handleUndo}
                    >
                        {I18n.t('Undo')}
                    </Button>
                }
            />
        </Box>
    );
};

export default ResidentTable;
