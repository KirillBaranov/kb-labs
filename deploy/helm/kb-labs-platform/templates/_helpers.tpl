{{/*
Fully qualified name for a service: <release>-<service>
*/}}
{{- define "kb-labs-platform.fullname" -}}
{{- printf "%s-%s" .Release.Name .name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels for a service.
*/}}
{{- define "kb-labs-platform.labels" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/part-of: kb-labs-platform
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Selector labels for a service — must be a stable subset of the labels above.
*/}}
{{- define "kb-labs-platform.selectorLabels" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Full image reference for a service. Requires an explicit image.tag — never
defaults to "latest" (docs/deployment/docker-build-hygiene.md's sibling rule
for the compose path: infra/docker-compose.backend.yml pins tags the same
way). Fails the render with a clear message instead of a bare YAML parse
error on a dangling ":" if tag is left unset.
*/}}
{{- define "kb-labs-platform.image" -}}
{{- $tag := required "image.tag is required — pin an explicit release version, e.g. --set image.tag=2.114.0. Never defaults to \"latest\" (see docs/deployment/docker-build-hygiene.md)." .Values.image.tag -}}
{{- printf "%s/%s:%s" .Values.image.registry .svc.image $tag -}}
{{- end -}}
