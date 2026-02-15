import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  WEEKLY_DAYS,
  normalizeWeeklyAvailability,
  type WeeklyAvailability,
} from '@/lib/weekly-availability';

const SLOT_LABELS = ['8a', '9a', '10a', '11a', '12p', '1p', '2p', '3p', '4p', '5p', '6p', '7p'];
const SLOT_TO_HHMM: Record<string, string> = {
  '8a': '08:00',
  '9a': '09:00',
  '10a': '10:00',
  '11a': '11:00',
  '12p': '12:00',
  '1p': '13:00',
  '2p': '14:00',
  '3p': '15:00',
  '4p': '16:00',
  '5p': '17:00',
  '6p': '18:00',
  '7p': '19:00',
};

type DragState = {
  startDayIndex: number | null;
  startSlotIndex: number | null;
  endDayIndex: number | null;
  endSlotIndex: number | null;
  mode: 'add' | 'remove';
};

type DragPreview = {
  minDay: number;
  maxDay: number;
  minSlot: number;
  maxSlot: number;
} | null;

type WeeklyAvailabilityCalendarProps = {
  value: WeeklyAvailability;
  onChange: (next: WeeklyAvailability) => void;
};

function toMinutes(hhmm: string): number | null {
  const match = String(hhmm || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function toHHMM(minutes: number): string {
  const safe = Math.max(0, Math.min(24 * 60, Math.round(minutes)));
  const h = String(Math.floor(safe / 60)).padStart(2, '0');
  const m = String(safe % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function parseRange(range: string): [number, number] | null {
  const [startRaw, endRaw] = String(range || '').split('-', 2).map((v) => v.trim());
  if (!startRaw || !endRaw) return null;
  const start = toMinutes(startRaw);
  const end = toMinutes(endRaw);
  if (start == null || end == null || end <= start) return null;
  return [start, end];
}

function weeklyToSelected(weekly: WeeklyAvailability): Set<string> {
  const normalized = normalizeWeeklyAvailability(weekly);
  const next = new Set<string>();

  WEEKLY_DAYS.forEach((day) => {
    const daySlots = normalized[day] ?? [];
    for (const slotRange of daySlots) {
      const parsed = parseRange(slotRange);
      if (!parsed) continue;
      const [rangeStart, rangeEnd] = parsed;

      SLOT_LABELS.forEach((slotLabel) => {
        const startHHMM = SLOT_TO_HHMM[slotLabel];
        const slotStart = toMinutes(startHHMM);
        if (slotStart == null) return;
        const slotEnd = slotStart + 60;
        if (slotStart < rangeEnd && slotEnd > rangeStart) {
          next.add(`${day}|${slotLabel}`);
        }
      });
    }
  });

  return next;
}

function selectedToWeekly(selected: Set<string>): WeeklyAvailability {
  const out = normalizeWeeklyAvailability({});

  WEEKLY_DAYS.forEach((day) => {
    const selectedIndices = SLOT_LABELS
      .map((slotLabel, idx) => (selected.has(`${day}|${slotLabel}`) ? idx : -1))
      .filter((idx) => idx >= 0)
      .sort((a, b) => a - b);

    if (selectedIndices.length === 0) {
      out[day] = null;
      return;
    }

    const ranges: string[] = [];
    let runStart = selectedIndices[0];
    let runEnd = selectedIndices[0];

    for (let i = 1; i < selectedIndices.length; i += 1) {
      const current = selectedIndices[i];
      if (current === runEnd + 1) {
        runEnd = current;
        continue;
      }

      const startMin = toMinutes(SLOT_TO_HHMM[SLOT_LABELS[runStart]]) ?? 0;
      const endMin = (toMinutes(SLOT_TO_HHMM[SLOT_LABELS[runEnd]]) ?? 0) + 60;
      ranges.push(`${toHHMM(startMin)}-${toHHMM(endMin)}`);

      runStart = current;
      runEnd = current;
    }

    const finalStartMin = toMinutes(SLOT_TO_HHMM[SLOT_LABELS[runStart]]) ?? 0;
    const finalEndMin = (toMinutes(SLOT_TO_HHMM[SLOT_LABELS[runEnd]]) ?? 0) + 60;
    ranges.push(`${toHHMM(finalStartMin)}-${toHHMM(finalEndMin)}`);
    out[day] = ranges;
  });

  return out;
}

export function WeeklyAvailabilityCalendar({ value, onChange }: WeeklyAvailabilityCalendarProps) {
  const [selected, setSelected] = useState<Set<string>>(() => weeklyToSelected(value));
  const [dragPreview, setDragPreview] = useState<DragPreview>(null);
  const dragStateRef = useRef<DragState>({
    startDayIndex: null,
    startSlotIndex: null,
    endDayIndex: null,
    endSlotIndex: null,
    mode: 'add',
  });

  useEffect(() => {
    setSelected(weeklyToSelected(value));
  }, [value]);

  const updateSelected = useCallback((next: Set<string>) => {
    setSelected(next);
    onChange(selectedToWeekly(next));
  }, [onChange]);

  const applyRange = useCallback(
    (minDay: number, maxDay: number, minSlot: number, maxSlot: number, mode: 'add' | 'remove') => {
      const next = new Set(selected);
      for (let d = minDay; d <= maxDay; d += 1) {
        for (let s = minSlot; s <= maxSlot; s += 1) {
          const key = `${WEEKLY_DAYS[d]}|${SLOT_LABELS[s]}`;
          if (mode === 'add') next.add(key);
          else next.delete(key);
        }
      }
      updateSelected(next);
    },
    [selected, updateSelected]
  );

  const handleCellMouseDown = useCallback(
    (dayIndex: number, slotIndex: number) => {
      const key = `${WEEKLY_DAYS[dayIndex]}|${SLOT_LABELS[slotIndex]}`;
      const isSelected = selected.has(key);
      const mode: 'add' | 'remove' = isSelected ? 'remove' : 'add';
      dragStateRef.current = {
        startDayIndex: dayIndex,
        startSlotIndex: slotIndex,
        endDayIndex: dayIndex,
        endSlotIndex: slotIndex,
        mode,
      };
      setDragPreview({ minDay: dayIndex, maxDay: dayIndex, minSlot: slotIndex, maxSlot: slotIndex });
    },
    [selected]
  );

  const handleCellMouseEnter = useCallback((dayIndex: number, slotIndex: number) => {
    const state = dragStateRef.current;
    if (state.startDayIndex == null || state.startSlotIndex == null) return;
    state.endDayIndex = dayIndex;
    state.endSlotIndex = slotIndex;
    const minDay = Math.min(state.startDayIndex, dayIndex);
    const maxDay = Math.max(state.startDayIndex, dayIndex);
    const minSlot = Math.min(state.startSlotIndex, slotIndex);
    const maxSlot = Math.max(state.startSlotIndex, slotIndex);
    setDragPreview({ minDay, maxDay, minSlot, maxSlot });
  }, []);

  const handleMouseUp = useCallback(() => {
    const state = dragStateRef.current;
    if (state.startDayIndex == null || state.startSlotIndex == null) return;
    const minDay = Math.min(state.startDayIndex, state.endDayIndex ?? state.startDayIndex);
    const maxDay = Math.max(state.startDayIndex, state.endDayIndex ?? state.startDayIndex);
    const minSlot = Math.min(state.startSlotIndex, state.endSlotIndex ?? state.startSlotIndex);
    const maxSlot = Math.max(state.startSlotIndex, state.endSlotIndex ?? state.startSlotIndex);
    applyRange(minDay, maxDay, minSlot, maxSlot, state.mode);
    dragStateRef.current = {
      startDayIndex: null,
      startSlotIndex: null,
      endDayIndex: null,
      endSlotIndex: null,
      mode: 'add',
    };
    setDragPreview(null);
  }, [applyRange]);

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

  const runPosition = useMemo(() => {
    const map: Record<string, 'only' | 'first' | 'middle' | 'last'> = {};
    WEEKLY_DAYS.forEach((day, dayIndex) => {
      const selectedSlots = SLOT_LABELS
        .map((slotLabel, idx) => (selected.has(`${day}|${slotLabel}`) ? idx : -1))
        .filter((idx) => idx >= 0)
        .sort((a, b) => a - b);
      if (selectedSlots.length === 0) return;

      const runs: number[][] = [];
      let run: number[] = [selectedSlots[0]];
      for (let i = 1; i < selectedSlots.length; i += 1) {
        if (selectedSlots[i] === run[run.length - 1] + 1) run.push(selectedSlots[i]);
        else {
          runs.push(run);
          run = [selectedSlots[i]];
        }
      }
      runs.push(run);

      runs.forEach((entries) => {
        entries.forEach((slotIndex, pos) => {
          const key = `${dayIndex}-${slotIndex}`;
          if (entries.length === 1) map[key] = 'only';
          else if (pos === 0) map[key] = 'first';
          else if (pos === entries.length - 1) map[key] = 'last';
          else map[key] = 'middle';
        });
      });
    });
    return map;
  }, [selected]);

  const toggleDay = useCallback((day: string) => {
    const allSelected = SLOT_LABELS.every((slotLabel) => selected.has(`${day}|${slotLabel}`));
    const next = new Set(selected);
    SLOT_LABELS.forEach((slotLabel) => {
      const key = `${day}|${slotLabel}`;
      if (allSelected) next.delete(key);
      else next.add(key);
    });
    updateSelected(next);
  }, [selected, updateSelected]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Click and drag to mark when the vendor is available. You can select multiple blocks per day.
      </p>
      <div className="overflow-x-auto select-none rounded-lg border border-border/60 bg-card/40 p-3">
        <div className="min-w-[720px] relative">
          {dragPreview && (
            <div
              className="absolute pointer-events-none rounded-md border-2 border-primary/50 bg-primary/20 z-10 transition-all duration-75"
              style={{
                left: `${((1 + dragPreview.minDay) / 8) * 100}%`,
                width: `${((dragPreview.maxDay - dragPreview.minDay + 1) / 8) * 100}%`,
                top: `${((1 + dragPreview.minSlot) / 13) * 100}%`,
                height: `${((dragPreview.maxSlot - dragPreview.minSlot + 1) / 13) * 100}%`,
              }}
              aria-hidden
            />
          )}
          <div className="grid grid-cols-8 gap-x-1 gap-y-0">
            <div className="h-9" />
            {WEEKLY_DAYS.map((day) => (
              <button
                key={day}
                type="button"
                className="h-9 rounded-md bg-muted/40 px-2 py-1 text-center transition-colors hover:bg-muted/70"
                onClick={() => toggleDay(day)}
                aria-label={`Toggle all slots for ${day}`}
              >
                <p className="text-[11px] font-medium text-foreground capitalize">{day.slice(0, 3)}</p>
              </button>
            ))}
            {SLOT_LABELS.map((slotLabel, slotIndex) => (
              <div key={`row-${slotLabel}`} className="contents">
                <div className="h-7 flex items-center justify-end pr-2 text-[10px] text-muted-foreground">
                  {slotLabel}
                </div>
                {WEEKLY_DAYS.map((day, dayIndex) => {
                  const key = `${day}|${slotLabel}`;
                  const active = selected.has(key);
                  const run = runPosition[`${dayIndex}-${slotIndex}`];
                  return (
                    <div
                      key={key}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        'h-7 border-x border-border/60 transition-colors cursor-pointer',
                        active
                          ? 'bg-primary/25 border-primary/50 hover:bg-primary/30'
                          : 'bg-background border-border/60 hover:bg-muted/60',
                        active && run === 'only' && 'rounded-md border-y',
                        active && run === 'first' && 'rounded-t-md border-t',
                        active && run === 'last' && 'rounded-b-md border-b',
                        active && run === 'middle' && 'border-t-0'
                      )}
                      aria-label={`${day} ${slotLabel}`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        handleCellMouseDown(dayIndex, slotIndex);
                      }}
                      onMouseEnter={() => handleCellMouseEnter(dayIndex, slotIndex)}
                      onClick={(event) => event.preventDefault()}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        const next = new Set(selected);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        updateSelected(next);
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {selected.size} slot{selected.size === 1 ? '' : 's'} selected
      </p>
    </div>
  );
}

