import { Fragment, type ReactNode } from 'react';
import type { GraphNode, GraphMeta } from '../types/graph';
import type { Branch } from '../types/graph';
import { NodeAvatar } from '../avatars';
import { bilingualBlock, bilingualInline } from '../utils/bilingual';
import { formatEpisodeBilingual } from '../utils/formatEpisode';

/**
 * Whitelist renderer for `gitMeta`: parses only `<code>...</code>` and
 * renders the rest as plain text. Avoids dangerouslySetInnerHTML so a
 * contributor cannot inject `<script>` via a PR. When the code content
 * matches a known branch id, appends the JA branch name in parens for
 * readability (e.g. `<code>zodiac</code>(十二支ん)`).
 */
function renderGitMeta(input: string, branches: Record<string, Branch>): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /<code>([\s\S]*?)<\/code>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(input))) {
    if (m.index > last) parts.push(<Fragment key={key++}>{input.slice(last, m.index)}</Fragment>);
    const codeText = m[1];
    parts.push(<code key={key++}>{codeText}</code>);
    const branch = branches[codeText];
    if (branch && branch.name && branch.name !== codeText) {
      parts.push(<Fragment key={key++}>（{branch.name}）</Fragment>);
    }
    last = m.index + m[0].length;
  }
  if (last < input.length) parts.push(<Fragment key={key++}>{input.slice(last)}</Fragment>);
  return parts;
}

interface DetailCardProps {
  node: GraphNode;
  branch: Branch;
  branches: Record<string, Branch>;
  meta: GraphMeta;
  nodesById: Record<string, GraphNode>;
  /** Reverse lookup: memberId -> list of group node ids that contain it. */
  groupsByMemberId: Record<string, string[]>;
  /** group label -> group node id. Used to make affiliation strings clickable. */
  groupIdByLabel: Record<string, string>;
  /** groupId -> ordered list of ancestor group ids. */
  groupAncestors: Record<string, string[]>;
  /** groupId -> direct subgroup ids. */
  subgroupsByGroupId: Record<string, string[]>;
  /** characterId -> list of event ids in which they participate. */
  eventsByParticipantId: Record<string, string[]>;
  open: boolean;
  onClose: () => void;
  onSelectNode: (id: string) => void;
  /** When provided, render a "back to list" button (mobile, came-from-list flow). */
  onBackToList?: () => void;
}

export function DetailCard({ node, branch, branches, meta, nodesById, groupsByMemberId, groupIdByLabel, groupAncestors, subgroupsByGroupId, eventsByParticipantId, open, onClose, onSelectNode, onBackToList }: DetailCardProps) {
  const kindLabel = bilingualInline(
    meta.labels.kind[node.kind] ?? node.kind,
    meta.labelsEn?.kind[node.kind],
  );
  const typeLabel = bilingualInline(
    meta.labels.type[node.type] ?? node.type,
    meta.labelsEn?.type[node.type],
  );
  const episodeLabel = formatEpisodeBilingual(meta.version, meta.versionEn, node.episode);
  const chapterTitle = meta.chapterTitles?.[node.episode];
  const arcLabel = node.arcs
    .map((arc) => bilingualInline(arc, meta.arcLabelsEn?.[arc]))
    .join(' / ');
  const whoLabel = bilingualInline(meta.ui?.detailWho ?? '正体', meta.uiEn?.detailWho);
  const memoLabel = bilingualInline(meta.ui?.detailMemo ?? '系譜メモ', meta.uiEn?.detailMemo);

  return (
    <div id="card" className={open ? 'open' : ''}>
      <div className="card-top">
        <div className="swatch" style={{ background: branch.color }} />
        {onBackToList && (
          <button type="button" className="back-to-list" onClick={onBackToList} aria-label="一覧へ戻る / Back to list">
            ← 一覧
          </button>
        )}
        <button type="button" className="close" onClick={onClose} aria-label="閉じる / Close">
          ✕
        </button>
        <div className="eyebrow">{arcLabel}</div>
        <div className="version">
          {episodeLabel}
          {chapterTitle && <span className="chapter-title"> {chapterTitle}</span>}
        </div>
        <div className="branch">
          {bilingualInline('系譜', 'Branch')}: {bilingualInline(branch.name, branch.nameEn)}
        </div>
        {node.kind === 'character' && (
          <div className="card-avatar" aria-hidden>
            <svg viewBox="-14 -14 28 28" width={72} height={72}>
              {node.tracedAvatar ? (
                <NodeAvatar
                  nodeId={`card-${node.id}`}
                  traced={node.tracedAvatar}
                  radius={12}
                  stroke={branch.color}
                  strokeWidth={2}
                />
              ) : (
                <circle r={12} fill={branch.color} stroke={branch.color} strokeWidth={2} />
              )}
            </svg>
          </div>
        )}
        <div className="name">
          <span className="name-ja">{node.label}</span>
          {node.labelEn && node.labelEn !== node.label && (
            <span className="name-en">{node.labelEn}</span>
          )}
        </div>
        <div className="badges">
          <span className="badge k">{kindLabel}</span>
          <span className="badge t">{typeLabel}</span>
        </div>
      </div>
      <div className="card-body">
        <div className="sec">
          <h4>{whoLabel}</h4>
          <p className="bilingual">{bilingualBlock(node.description, node.descriptionEn)}</p>
        </div>
        {(() => {
          // Direct affiliations: from node.affiliations strings + reverse-lookup memberships.
          // Inherited: transitive parents of direct groups, not already in direct.
          type Item = { key: string; label: string; labelEn?: string; gid?: string };
          const directSeenGid = new Set<string>();
          const directSeenStr = new Set<string>();
          const direct: Item[] = [];
          for (const a of node.affiliations ?? []) {
            const gid = groupIdByLabel[a] ?? groupIdByLabel[a.replace(/[＝=]/g, '')];
            if (gid && gid !== node.id) {
              if (directSeenGid.has(gid)) continue;
              directSeenGid.add(gid);
              const g = nodesById[gid];
              direct.push({ key: gid, label: a, labelEn: g?.labelEn, gid });
            } else {
              if (directSeenStr.has(a)) continue;
              directSeenStr.add(a);
              direct.push({ key: `s:${a}`, label: a });
            }
          }
          for (const gid of groupsByMemberId[node.id] ?? []) {
            if (directSeenGid.has(gid)) continue;
            const g = nodesById[gid];
            if (!g) continue;
            directSeenGid.add(gid);
            direct.push({ key: gid, label: g.label, labelEn: g.labelEn, gid });
          }
          // Inherited groups: ancestors of any direct group, not already direct
          const inheritedSet = new Set<string>();
          for (const gid of directSeenGid) {
            for (const a of groupAncestors[gid] ?? []) {
              if (!directSeenGid.has(a)) inheritedSet.add(a);
            }
          }
          const inherited: Item[] = [];
          for (const gid of inheritedSet) {
            const g = nodesById[gid];
            if (!g) continue;
            inherited.push({ key: gid, label: g.label, labelEn: g.labelEn, gid });
          }
          if (direct.length === 0 && inherited.length === 0) return null;
          const renderItem = (it: Item) => (
            <li key={it.key}>
              {it.gid ? (
                <button
                  type="button"
                  className="member-link affiliation-link"
                  onClick={() => onSelectNode(it.gid!)}
                >
                  <span className="member-ja">{it.label}</span>
                  {it.labelEn && it.labelEn !== it.label && (
                    <span className="member-en">{it.labelEn}</span>
                  )}
                </button>
              ) : (
                <span className="affiliation-plain">{it.label}</span>
              )}
            </li>
          );
          return (
            <>
              {direct.length > 0 && (
                <div className="sec attrs members">
                  <h4>所属 / Affiliation <span className="count">{direct.length}</span></h4>
                  <ul className="member-list">{direct.map(renderItem)}</ul>
                </div>
              )}
              {inherited.length > 0 && (
                <div className="sec attrs members inherited">
                  <h4>所属 (継承) / Inherited <span className="count">{inherited.length}</span></h4>
                  <ul className="member-list">{inherited.map(renderItem)}</ul>
                </div>
              )}
            </>
          );
        })()}
        {node.occupation && (
          <div className="sec attrs">
            <h4>職業 / Occupation</h4>
            <p>{node.occupation}</p>
          </div>
        )}
        {node.nen && (
          <div className="sec attrs nen">
            <h4>念 / Nen</h4>
            <p className="nen-type">系統: <strong>{node.nen.type}</strong></p>
            {node.nen.abilities && node.nen.abilities.length > 0 && (
              <ul className="attr-list">
                {node.nen.abilities.map((ab, i) => (
                  <li key={i}>
                    <strong>{ab.name}</strong>
                    {ab.code && ab.code !== ab.name && (
                      <span className="nen-code">（{ab.code}）</span>
                    )}
                    {ab.description && <div className="nen-desc">{ab.description}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {node.kind === 'group' && node.parents && node.parents.length > 0 && (
          <div className="sec attrs members parents">
            <h4>親グループ / Parent <span className="count">{node.parents.length}</span></h4>
            <ul className="member-list">
              {node.parents.map((pid) => {
                const p = nodesById[pid];
                if (!p) return <li key={pid}><span className="member-missing">{pid}</span></li>;
                return (
                  <li key={pid}>
                    <button type="button" className="member-link affiliation-link" onClick={() => onSelectNode(pid)}>
                      <span className="member-ja">{p.label}</span>
                      {p.labelEn && p.labelEn !== p.label && (
                        <span className="member-en">{p.labelEn}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {node.kind === 'group' && (subgroupsByGroupId[node.id]?.length ?? 0) > 0 && (
          <div className="sec attrs members subgroups">
            <h4>サブグループ / Subgroups <span className="count">{subgroupsByGroupId[node.id].length}</span></h4>
            <ul className="member-list">
              {subgroupsByGroupId[node.id].map((sid) => {
                const s = nodesById[sid];
                if (!s) return <li key={sid}><span className="member-missing">{sid}</span></li>;
                return (
                  <li key={sid}>
                    <button type="button" className="member-link affiliation-link" onClick={() => onSelectNode(sid)}>
                      <span className="member-ja">{s.label}</span>
                      {s.labelEn && s.labelEn !== s.label && (
                        <span className="member-en">{s.labelEn}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {node.kind === 'group' && node.members && node.members.length > 0 && (
          <div className="sec attrs members">
            <h4>メンバー / Members <span className="count">{node.members.length}</span></h4>
            <ul className="member-list">
              {node.members.map((mid) => {
                const m = nodesById[mid];
                if (!m) return (
                  <li key={mid}>
                    <span className="member-missing">{mid}</span>
                  </li>
                );
                return (
                  <li key={mid}>
                    <button
                      type="button"
                      className="member-link"
                      onClick={() => onSelectNode(mid)}
                    >
                      <span className="member-ja">{m.label}</span>
                      {m.labelEn && m.labelEn !== m.label && (
                        <span className="member-en">{m.labelEn}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {node.kind === 'event' && node.participants && node.participants.length > 0 && (
          <div className="sec attrs members participants">
            <h4>登場人物 / Participants <span className="count">{node.participants.length}</span></h4>
            <ul className="member-list">
              {node.participants.map((pid) => {
                const p = nodesById[pid];
                if (!p) return <li key={pid}><span className="member-missing">{pid}</span></li>;
                return (
                  <li key={pid}>
                    <button type="button" className="member-link" onClick={() => onSelectNode(pid)}>
                      <span className="member-ja">{p.label}</span>
                      {p.labelEn && p.labelEn !== p.label && (
                        <span className="member-en">{p.labelEn}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {node.kind === 'character' && (eventsByParticipantId[node.id]?.length ?? 0) > 0 && (
          <div className="sec attrs members appears-in">
            <h4>登場イベント / Appears In <span className="count">{eventsByParticipantId[node.id].length}</span></h4>
            <ul className="member-list">
              {eventsByParticipantId[node.id].map((eid) => {
                const e = nodesById[eid];
                if (!e) return <li key={eid}><span className="member-missing">{eid}</span></li>;
                return (
                  <li key={eid}>
                    <button type="button" className="member-link" onClick={() => onSelectNode(eid)}>
                      <span className="member-ja">{e.label}</span>
                      {e.labelEn && e.labelEn !== e.label && (
                        <span className="member-en">{e.labelEn}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <div className="sec git">
          <h4>{memoLabel}</h4>
          <p>{renderGitMeta(node.gitMeta, branches)}</p>
        </div>
      </div>
    </div>
  );
}
