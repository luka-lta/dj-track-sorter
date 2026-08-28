import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import type { GenreChoices, ScanTrack } from "@/types/dj-api";

const SKIP_VALUE = "__skip__";
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const TABLE_HEIGHT = "h-[26rem]";
const STICKY_HEAD = "sticky top-0 z-10 bg-background";

type SortColumn = "track_name" | "date_added";
type SortDirection = "asc" | "desc";
type SortState = { column: SortColumn; direction: SortDirection } | null;

function toFileUrl(path: string) {
  return "file://" + path.split("/").map(encodeURIComponent).join("/");
}

function formatDateAdded(iso: string) {
  return new Date(iso).toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function pageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const result: (number | "ellipsis")[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) result.push("ellipsis");
    result.push(page);
    previous = page;
  }
  return result;
}

function SortableHeader({
  label,
  column,
  sort,
  onSort,
  className,
}: {
  label: string;
  column: SortColumn;
  sort: SortState;
  onSort: (column: SortColumn) => void;
  className?: string;
}) {
  const isActive = sort?.column === column;
  const Icon = isActive ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead className={cn(STICKY_HEAD, className)}>
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => onSort(column)}
      >
        {label}
        <Icon className="size-3.5" />
      </button>
    </TableHead>
  );
}

function TrackTableRow({
  track,
  knownGenres,
  isSelected,
  isPlaying,
  onToggleSelected,
  onTogglePreview,
  onGenreChange,
}: {
  track: ScanTrack;
  knownGenres: string[];
  isSelected: boolean;
  isPlaying: boolean;
  onToggleSelected: (selected: boolean) => void;
  onTogglePreview: () => void;
  onGenreChange: (genre: string | null) => void;
}) {
  return (
    <TableRow className={!isSelected ? "opacity-50" : undefined}>
      <TableCell>
        <Checkbox
          checked={isSelected}
          onCheckedChange={(checked) => onToggleSelected(checked === true)}
          aria-label={`${track.track_name} auswählen`}
        />
      </TableCell>
      <TableCell>
        <Button variant="outline" size="icon" onClick={onTogglePreview}>
          {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
      </TableCell>
      <TableCell className="max-w-0 truncate">{track.track_name}</TableCell>
      <TableCell className="text-muted-foreground whitespace-nowrap">
        {formatDateAdded(track.date_added)}
      </TableCell>
      <TableCell className="text-right">
        <Select
          defaultValue={track.detected_genre ?? SKIP_VALUE}
          onValueChange={(value) => onGenreChange(value === SKIP_VALUE ? null : value)}
        >
          <SelectTrigger
            className={track.detected_genre ? "text-success ml-auto" : "ml-auto"}
            size="sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {!track.detected_genre && (
              <SelectItem value={SKIP_VALUE}>Überspringen</SelectItem>
            )}
            {knownGenres.map((genre) => (
              <SelectItem key={genre} value={genre}>
                {genre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
    </TableRow>
  );
}

export function TrackList({
  tracks,
  knownGenres,
  neuDirMissing,
  onSubmit,
}: {
  tracks: ScanTrack[];
  knownGenres: string[];
  neuDirMissing: boolean;
  onSubmit: (genreChoices: GenreChoices, selectedTracks: string[]) => void;
}) {
  const choicesRef = useRef<GenreChoices>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingTrack, setPlayingTrack] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(tracks.map((t) => t.track_name)),
  );
  const [sort, setSort] = useState<SortState>(null);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[1]);
  const [page, setPage] = useState(1);

  function toggleSort(column: SortColumn) {
    setPage(1);
    setSort((prev) => {
      if (prev?.column !== column) return { column, direction: "asc" };
      if (prev.direction === "asc") return { column, direction: "desc" };
      return null;
    });
  }

  const sortedTracks = useMemo(() => {
    if (!sort) return tracks;
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...tracks].sort((a, b) => factor * a[sort.column].localeCompare(b[sort.column]));
  }, [tracks, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedTracks.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    if (page !== currentPage) setPage(currentPage);
  }, [page, currentPage]);

  const pagedTracks = sortedTracks.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  function stopPreview() {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingTrack(null);
  }

  function togglePreview(track: ScanTrack) {
    const wasPlayingThisTrack = playingTrack === track.track_name;
    stopPreview();
    if (wasPlayingThisTrack) return;

    const audio = new Audio(toFileUrl(track.track_path));
    audio.addEventListener("ended", () => stopPreview());
    audio.play();
    audioRef.current = audio;
    setPlayingTrack(track.track_name);
  }

  function setGenreChoice(track: ScanTrack, genre: string | null) {
    if (genre) choicesRef.current[track.track_name] = genre;
    else delete choicesRef.current[track.track_name];
  }

  function toggleSelected(trackName: string, isSelected: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (isSelected) next.add(trackName);
      else next.delete(trackName);
      return next;
    });
  }

  function toggleAll(isSelected: boolean) {
    setSelected(isSelected ? new Set(tracks.map((t) => t.track_name)) : new Set());
  }

  if (tracks.length === 0) {
    return (
      <p className={neuDirMissing ? "text-destructive text-sm" : "text-sm"}>
        {neuDirMissing
          ? "Der Neu-Ordner existiert nicht. Bitte in den Einstellungen einen gültigen Ordner auswählen."
          : "Keine neuen Tracks gefunden."}
      </p>
    );
  }

  const allSelected = selected.size === tracks.length;
  const someSelected = selected.size > 0 && !allSelected;

  return (
    <div>
      <div
        className={cn(
          "rounded-lg border border-border mb-3 overflow-hidden",
          "[&_[data-slot=table-container]]:overflow-visible",
          TABLE_HEIGHT,
        )}
      >
        <ScrollArea className="h-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={cn(STICKY_HEAD, "w-10")}>
                  <Checkbox
                    checked={someSelected ? "indeterminate" : allSelected}
                    onCheckedChange={(checked) => toggleAll(checked === true)}
                    aria-label="Alle Tracks auswählen"
                  />
                </TableHead>
                <TableHead className={cn(STICKY_HEAD, "w-12")} />
                <SortableHeader label="Track" column="track_name" sort={sort} onSort={toggleSort} />
                <SortableHeader
                  label="Hinzugefügt"
                  column="date_added"
                  sort={sort}
                  onSort={toggleSort}
                  className="whitespace-nowrap"
                />
                <TableHead className={cn(STICKY_HEAD, "text-right")}>Genre</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedTracks.map((track) => (
                <TrackTableRow
                  key={track.track_name}
                  track={track}
                  knownGenres={knownGenres}
                  isSelected={selected.has(track.track_name)}
                  isPlaying={playingTrack === track.track_name}
                  onToggleSelected={(isSelected) => toggleSelected(track.track_name, isSelected)}
                  onTogglePreview={() => togglePreview(track)}
                  onGenreChange={(genre) => setGenreChoice(track, genre)}
                />
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      <div className="flex items-center justify-between mb-4 gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Pro Seite</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(Number(value));
              setPage(1);
            }}
          >
            <SelectTrigger size="sm" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {totalPages > 1 && (
          <Pagination className="mx-0 w-auto justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setPage((p) => Math.max(1, p - 1));
                  }}
                  aria-disabled={currentPage === 1}
                  className={currentPage === 1 ? "pointer-events-none opacity-50" : undefined}
                />
              </PaginationItem>
              {pageNumbers(currentPage, totalPages).map((p, i) =>
                p === "ellipsis" ? (
                  <PaginationItem key={`ellipsis-${i}`}>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={p}>
                    <PaginationLink
                      href="#"
                      isActive={p === currentPage}
                      onClick={(e) => {
                        e.preventDefault();
                        setPage(p);
                      }}
                    >
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                ),
              )}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setPage((p) => Math.min(totalPages, p + 1));
                  }}
                  aria-disabled={currentPage === totalPages}
                  className={
                    currentPage === totalPages ? "pointer-events-none opacity-50" : undefined
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>

      <Button
        disabled={selected.size === 0}
        onClick={() => {
          stopPreview();
          onSubmit(choicesRef.current, [...selected]);
        }}
      >
        Vorschau ({selected.size})
      </Button>
    </div>
  );
}
