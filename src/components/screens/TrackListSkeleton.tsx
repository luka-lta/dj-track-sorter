import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

export function TrackListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="rounded-lg border border-border mb-3 overflow-hidden h-[26rem]">
      <Table>
        <TableBody>
          {Array.from({ length: rows }, (_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="size-4 rounded-[4px]" />
              </TableCell>
              <TableCell>
                <Skeleton className="size-9 rounded-md" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-48" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-28" />
              </TableCell>
              <TableCell className="text-right">
                <Skeleton className="h-8 w-32 ml-auto" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
