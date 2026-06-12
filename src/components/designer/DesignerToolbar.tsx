import {
  BoxSelect,
  Brush,
  Download,
  Eraser,
  FileSpreadsheet,
  Map as MapIcon,
  MousePointer2,
  Redo2,
  Ruler,
  Settings,
  Undo2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DESIGNER_CONSTANTS, type EraseLayer, type PlanEditor, type RectMode, type Tool } from './usePlanEditor';

const { MIN_DIM_M, MAX_DIM_M } = DESIGNER_CONSTANTS;

const TOOL_OPTIONS: { tool: Tool; label: string; key: string; icon: typeof MousePointer2 }[] = [
  { tool: 'select', label: 'Select', key: 'V', icon: MousePointer2 },
  { tool: 'brush', label: 'Brush', key: 'B', icon: Brush },
  { tool: 'rect', label: 'Rectangle', key: 'R', icon: BoxSelect },
  { tool: 'asset', label: 'Asset', key: 'A', icon: MapIcon },
  { tool: 'erase', label: 'Erase', key: 'E', icon: Eraser },
];

export function DesignerToolbar({ editor }: { editor: PlanEditor }) {
  const {
    tool, setTool,
    brushSize, setBrushSize,
    eraseLayer, setEraseLayer,
    rectMode, setRectMode,
    undo, redo, fitToView, exportPng, exportCsv,
    settingsOpen, setSettingsOpen,
    stats,
    draftWidth, setDraftWidth,
    draftHeight, setDraftHeight,
    draftAllowOutsideBeds, setDraftAllowOutsideBeds,
    applySettings,
  } = editor;
  const undoRef = editor.undoRef;
  const redoRef = editor.redoRef;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-border p-0.5">
          {TOOL_OPTIONS.map((option) => (
            <Button
              key={option.tool}
              variant={tool === option.tool ? 'default' : 'ghost'}
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs"
              title={`${option.label} (${option.key})`}
              onClick={() => setTool(option.tool)}
            >
              <option.icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{option.label}</span>
            </Button>
          ))}
        </div>
        {(tool === 'brush' || tool === 'erase') && (
          <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
            <Button variant={brushSize === 1 ? 'secondary' : 'ghost'} size="sm" className="h-8 px-2 text-xs" onClick={() => setBrushSize(1)}>1×1</Button>
            <Button variant={brushSize === 3 ? 'secondary' : 'ghost'} size="sm" className="h-8 px-2 text-xs" onClick={() => setBrushSize(3)}>3×3</Button>
          </div>
        )}
        {tool === 'erase' && (
          <Select value={eraseLayer} onValueChange={(v) => setEraseLayer(v as EraseLayer)}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="plants">Plants</SelectItem>
              <SelectItem value="ground">Ground</SelectItem>
            </SelectContent>
          </Select>
        )}
        {tool === 'rect' && (
          <Select value={rectMode} onValueChange={(v) => setRectMode(v as RectMode)}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="plants">Plants</SelectItem>
              <SelectItem value="asset">Asset</SelectItem>
            </SelectContent>
          </Select>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={undo} disabled={undoRef.current.length === 0} title="Undo">
            <Undo2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Undo</span>
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={redo} disabled={redoRef.current.length === 0} title="Redo">
            <Redo2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Redo</span>
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={fitToView} title="Fit">
            <Ruler className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Fit</span>
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={exportPng} title="Export PNG">
            <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">PNG</span>
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={exportCsv} disabled={!stats || stats.perCrop.length === 0} title="Export CSV">
            <FileSpreadsheet className="w-3.5 h-3.5" /> <span className="hidden sm:inline">CSV</span>
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={() => setSettingsOpen((o) => !o)} title="Settings">
            <Settings className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Settings</span>
          </Button>
        </div>
      </div>

      {settingsOpen && (
        <div className="grid gap-3 border-b border-border bg-muted/40 p-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
          <div className="space-y-1">
            <Label className="text-xs">Width (m)</Label>
            <Input type="number" min={MIN_DIM_M} max={MAX_DIM_M} step="0.25" value={draftWidth} onChange={(e) => setDraftWidth(Number(e.target.value))} className="h-8" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Height (m)</Label>
            <Input type="number" min={MIN_DIM_M} max={MAX_DIM_M} step="0.25" value={draftHeight} onChange={(e) => setDraftHeight(Number(e.target.value))} className="h-8" />
          </div>
          <label className="flex items-center gap-2 pt-5 text-sm">
            <input
              type="checkbox"
              checked={draftAllowOutsideBeds}
              onChange={(e) => setDraftAllowOutsideBeds(e.target.checked)}
            />
            Allow planting outside beds
          </label>
          <Button size="sm" className="mt-5 h-8" onClick={applySettings}>Apply</Button>
        </div>
      )}
    </>
  );
}
