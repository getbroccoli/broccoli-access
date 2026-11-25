import { cn } from "@/lib/class-names";

export const couldntChangeChipClassName = cn(
  "inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-red-800",
  "cursor-pointer transition-colors hover:bg-red-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
);

export const couldntChangeCopy = {
  SUSPEND: { chip: "apps.couldnt.disable", title: "apps.couldnt.disableTitle" },
  REACTIVATE: { chip: "apps.couldnt.enable", title: "apps.couldnt.enableTitle" },
  REMOVE: { chip: "apps.couldnt.remove", title: "apps.couldnt.removeTitle" },
  INVITE: { chip: "apps.couldnt.invite", title: "apps.couldnt.inviteTitle" },
} as const;
