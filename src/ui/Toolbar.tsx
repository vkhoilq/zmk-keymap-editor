import { useState, useCallback } from "react";

export interface ToolbarProps {
  owner: string;
  repo: string;
  branch: string;
  token: string;
  keyboards: { id: string; label: string }[];
  keyboardId: string;
  status: { kind: "idle" | "busy" | "ok" | "error"; message: string };
  dirty: boolean;
  canSave: boolean;
  onOwnerChange: (v: string) => void;
  onRepoChange: (v: string) => void;
  onBranchChange: (v: string) => void;
  onTokenChange: (v: string) => void;
  onKeyboardChange: (id: string) => void;
  onLoad: () => void;
  onSave: () => void;
}

export function Toolbar(props: ToolbarProps): JSX.Element {
  const {
    owner,
    repo,
    branch,
    token,
    keyboards,
    keyboardId,
    status,
    dirty,
    canSave,
    onOwnerChange,
    onRepoChange,
    onBranchChange,
    onTokenChange,
    onKeyboardChange,
    onLoad,
    onSave,
  } = props;

  const [showToken, setShowToken] = useState(false);

  const handleTokenToggle = useCallback(() => {
    setShowToken((prev) => !prev);
  }, []);

  const saveDisabled = !canSave || !dirty;

  return (
    <div className="toolbar" role="toolbar" aria-label="Repository toolbar">
      <div className="toolbar-field">
        <label htmlFor="owner">Owner</label>
        <input
          id="owner"
          type="text"
          value={owner}
          onChange={(e) => onOwnerChange(e.target.value)}
          placeholder="owner"
          autoComplete="off"
        />
      </div>

      <div className="toolbar-field">
        <label htmlFor="repo">Repo</label>
        <input
          id="repo"
          type="text"
          value={repo}
          onChange={(e) => onRepoChange(e.target.value)}
          placeholder="repo"
          autoComplete="off"
        />
      </div>

      <div className="toolbar-field">
        <label htmlFor="branch">Branch</label>
        <input
          id="branch"
          type="text"
          value={branch}
          onChange={(e) => onBranchChange(e.target.value)}
          placeholder="main"
          autoComplete="off"
        />
      </div>

      <div className="toolbar-field">
        <label htmlFor="token">Token</label>
        <div className="token-wrap">
          <input
            id="token"
            className="token-input"
            type={showToken ? "text" : "password"}
            value={token}
            onChange={(e) => onTokenChange(e.target.value)}
            placeholder="ghp_..."
            autoComplete="off"
          />
          <button
            type="button"
            className="token-toggle"
            onClick={handleTokenToggle}
            aria-label={showToken ? "Hide token" : "Show token"}
            aria-pressed={showToken}
          >
            {showToken ? "◡" : "●"}
          </button>
        </div>
      </div>

      <div className="toolbar-field">
        <label htmlFor="keyboard">Keyboard</label>
        <select
          id="keyboard"
          value={keyboardId}
          onChange={(e) => onKeyboardChange(e.target.value)}
        >
          {keyboards.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label || k.id}
            </option>
          ))}
        </select>
      </div>

      <div className="toolbar-actions">
        <button type="button" onClick={onLoad}>
          Load
        </button>
        <button
          type="button"
          className="primary"
          onClick={onSave}
          disabled={saveDisabled}
          aria-disabled={saveDisabled}
        >
          {dirty && <span className="dirty-dot" aria-hidden="true">•</span>}
          Save
        </button>
        <div className={`status ${status.kind}`} role="status" aria-live="polite">
          {status.message}
        </div>
      </div>
    </div>
  );
}
