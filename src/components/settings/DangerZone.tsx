import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';

interface DangerZoneProps {
  onDelete: () => void;
}

export function DangerZone({ onDelete }: DangerZoneProps) {
  return (
    <SettingsSection title="Danger Zone" tone="danger">
      <SettingsRow
        label="Delete Account"
        onPress={onDelete}
        hideChevron
        destructive
      />
    </SettingsSection>
  );
}
