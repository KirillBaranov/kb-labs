import Image from 'next/image';

type AgentControlSectionProps = {
  title: string;
  lead: string;
  codeLabel: string;
  codeCaption: string;
  screenshotAlt: string;
};

export function AgentControlSection({
  title,
  lead,
  codeLabel,
  codeCaption,
  screenshotAlt,
}: AgentControlSectionProps) {
  return (
    <section className="ac-section reveal">
      <div className="ac-head">
        <h2 className="ac-title">{title}</h2>
        <p className="ac-lead">{lead}</p>
      </div>

      <div className="ac-body">
        {/* Left: code block */}
        <div className="ac-code-wrap">
          <span className="ac-code-label">{codeLabel}</span>
          <pre className="ac-code"><code>{`const permissions = combinePermissions()
  .withEnv(['CLICKUP_API_KEY', 'CLICKUP_TEAM_ID'])
  .withNetwork({ fetch: ['api.clickup.com'] })
  .withQuotas({ timeoutMs: 30000, memoryMb: 128 })
  .build()

// Declared commands = everything the agent can call.
// Nothing else is reachable.
commands: [
  { path: 'clickup task create', ... },
  { path: 'clickup task search', ... },
  // No 'task delete' → agent physically cannot delete
]`}</code></pre>
          <p className="ac-code-caption">{codeCaption}</p>
        </div>

        {/* Right: screenshot */}
        <div className="ac-screenshot-wrap">
          <Image
            src="/screenshots/commit-plugin-ui-example.png"
            alt={screenshotAlt}
            width={960}
            height={600}
            className="ac-screenshot"
          />
        </div>
      </div>
    </section>
  );
}
