export type ServiceEntry = {
  id: string;
  memberId: string;
  serviceDate: string;
  serviceLabel: string;
  createdAt: string;
};

export type ServiceEntryFormValues = {
  memberId: string;
  serviceDate: string;
  serviceLabel: string;
};

export const serviceStatusOptions = [
  { label: "Attended", value: "Attended" },
  { label: "Medical", value: "Medical" },
  { label: "Hold", value: "Hold" },
  { label: "Vacation", value: "Vacation" },
] as const;

export const defaultServiceStatus: string = serviceStatusOptions[0].value;

export type ServiceEntryRow = {
  id: string;
  member_id: string;
  service_date: string;
  service_label: string;
  created_at: string;
};

export function getTodayDate() {
  return new Date().toLocaleDateString("en-CA");
}

export function createEmptyServiceEntryForm(): ServiceEntryFormValues {
  return {
    memberId: "",
    serviceDate: getTodayDate(),
    serviceLabel: defaultServiceStatus,
  };
}

export function mapServiceEntryRow(row: ServiceEntryRow): ServiceEntry {
  return {
    id: row.id,
    memberId: row.member_id,
    serviceDate: row.service_date,
    serviceLabel: row.service_label,
    createdAt: row.created_at,
  };
}

export function toServiceEntryInsert(values: ServiceEntryFormValues) {
  return {
    member_id: values.memberId,
    service_date: values.serviceDate,
    service_label: values.serviceLabel || defaultServiceStatus,
  };
}
