import { RecordHistory } from "@/features/records";

import { EMPLOYEE_DESCRIPTION } from "./employeeDescription";

type Props = {
  employeeId: string;
};

/** A person's History tab: every change to them. */
export function EmployeeHistory({ employeeId }: Props) {
  return (
    <RecordHistory
      recordType="EMPLOYEE"
      recordId={employeeId}
      description={EMPLOYEE_DESCRIPTION}
      titled={false}
    />
  );
}
