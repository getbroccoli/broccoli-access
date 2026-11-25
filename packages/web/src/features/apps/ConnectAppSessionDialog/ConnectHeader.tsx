import { AppMark } from "@/components/AppMark";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = {
  connector: { id: string; name: string };
  title: string;
};

/** The app's mark beside the dialog's title. */
export function ConnectHeader({ connector, title }: Props) {
  return (
    <DialogHeader className="gap-3">
      <div className="flex items-center gap-3 pr-8">
        <AppMark
          name={connector.name}
          catalogKey={connector.id}
          className="size-9 rounded-lg text-base"
        />
        <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
      </div>
    </DialogHeader>
  );
}
