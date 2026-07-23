// Copyright (c) 2026 AI anime
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CharacterSearch({
  value,
  onValueChange,
  resultCount: _resultCount,
  totalCount: _totalCount,
  placeholder = "Search characters",
}: {
  value: string;
  onValueChange: (value: string) => void;
  resultCount: number;
  totalCount: number;
  placeholder?: string;
}) {
  return (
    <div className="relative min-w-[220px] flex-1">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        aria-label="Search characters"
        className="h-8 border-0 bg-transparent pl-8 pr-8 text-sm shadow-none focus-visible:border-0 focus-visible:ring-0 focus-visible:ring-offset-0 [appearance:none] [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
        placeholder={placeholder}
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {value ? (
        <Button
          aria-label="Clear character search"
          className="absolute right-1 top-1/2 size-6 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          size="icon-xs"
          title="Clear character search"
          type="button"
          variant="ghost"
          onClick={() => onValueChange("")}
        >
          <X className="size-3" />
        </Button>
      ) : null}
    </div>
  );
}
