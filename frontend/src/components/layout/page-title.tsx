import { cn } from "@/lib/utils";

interface PageTitleProps {
  /** The volume this page is, as in a book's table of contents: 卷二, 卷三 … */
  juan: string;
  title: string;
  className?: string;
}

/** A page's title set like the opening of a volume: the volume number in vermilion Kai above a Song title. */
export function PageTitle({ juan, title, className }: PageTitleProps) {
  return (
    <div className={className}>
      <p className="font-kai text-brand text-sm tracking-[0.2em]">{juan}</p>
      <h1 className={cn("font-display mt-1 text-[28px] leading-tight font-bold tracking-[0.12em]")}>
        {title}
      </h1>
    </div>
  );
}
