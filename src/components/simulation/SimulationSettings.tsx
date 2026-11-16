import { useState } from "react";
import type { AnnouncementScenario, IAnnouncementService } from "../../mocks";
import { Icon } from "../ui/Icon";
import { ResetWorkspaceControl } from "./ResetWorkspaceControl";
import { ScenarioSelector } from "./ScenarioSelector";

interface SimulationSettingsProps {
  service: Pick<IAnnouncementService, "getScenario" | "setScenario">;
  onReset: () => Promise<void>;
  onDialogChange: (open: boolean) => void;
}

/**
 * Developer tools for the simulated service. The scenario only configures how NEW operations
 * behave; it is never a source of publication status. The service is read again after each change.
 */
export function SimulationSettings({ service, onReset, onDialogChange }: SimulationSettingsProps) {
  const [scenario, setScenario] = useState<AnnouncementScenario>(() => service.getScenario());
  const [message, setMessage] = useState("");

  const changeScenario = (next: AnnouncementScenario) => {
    service.setScenario(next);
    setScenario(service.getScenario());
    setMessage("");
  };

  return (
    <details className="group rounded-card border border-line bg-tools px-3.75 sm:px-5">
      <summary className="flex min-h-13.5 list-none items-center justify-between gap-3.5 py-3.75 text-xs [&::-webkit-details-marker]:hidden">
        <span className="flex flex-wrap items-center gap-1.75 text-2xs font-strong sm:gap-2.25 sm:text-xs">
          <Icon name="refresh" className="size-3.5" />
          <span>Simulation settings</span>
          <span className="rounded-sm bg-line px-1.5 py-0.5 text-[8px] font-book text-ink sm:text-3xs">
            Developer tools
          </span>
        </span>
        <span className="flex items-center gap-2.25 text-2xs text-muted">
          <span className="hidden sm:inline">Test a different outcome</span>
          <Icon name="chevron" className="size-3.25 transition-transform duration-150 group-open:rotate-90" />
        </span>
      </summary>
      <div className="grid grid-cols-1 gap-5 border-t border-line pt-5.5 pb-4 sm:grid-cols-2 sm:gap-8">
        <ScenarioSelector value={scenario} onChange={changeScenario} />
        <ResetWorkspaceControl
          onReset={onReset}
          onDialogChange={(open) => {
            if (open) setMessage("");
            onDialogChange(open);
          }}
          onResetComplete={() => {
            setScenario(service.getScenario());
            setMessage("Workspace reset. Attempts cleared and default scenario restored.");
          }}
        />
      </div>
      <p className="border-t border-line pt-3 text-2xs text-muted">
        These controls affect the simulator. Existing attempts keep their original scenario. Turn off Automatic updates
        above to inspect intermediate states manually.
      </p>
      <p className="my-3 text-xs text-success empty:mt-0" aria-live="polite">
        {message}
      </p>
    </details>
  );
}
