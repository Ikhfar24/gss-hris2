import { AttendanceHistoryView } from "@/components/attendance/AttendanceHistoryView";
import { DossierPage } from "@/components/ui/dossier";

export default function AttendanceHistoryPage() {
  return (
    <DossierPage className="max-w-6xl">
      <AttendanceHistoryView />
    </DossierPage>
  );
}
