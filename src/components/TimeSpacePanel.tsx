import React, { useMemo } from 'react';
import { Clock, MapPin } from 'lucide-react';
import { GenealogicalTree, TriangulationGroup } from '../types/triangulation';
import { MAX_GENERATIONS, ancestorBirthWindow, ancestorLabel } from '../utils/segmentAge';
import { TreeOwners, analyzeTimeSpace } from '../utils/timeSpace';
import { canonicalizeName } from '../utils/triangulationEngine';
import { describeLineage } from '../utils/lineage';

interface TimeSpacePanelProps {
  group: TriangulationGroup;
  tree: GenealogicalTree | null;
  homeId?: string;
  treeOwners: TreeOwners;
}

const MAX_HOTSPOTS = 6;
const MAX_CANDIDATES = 8;

export const TimeSpacePanel: React.FC<TimeSpacePanelProps> = ({ group, tree, homeId, treeOwners }) => {
  const estimate = group.generationEstimate;

  const analysis = useMemo(() => {
    if (!estimate || !tree) return null;
    return analyzeTimeSpace({
      estimate,
      tree,
      homeId,
      groupLineage: group.lineage,
      memberNames: new Set(group.matches.map(m => canonicalizeName(m.matchName))),
      owners: treeOwners
    });
  }, [estimate, tree, homeId, group, treeOwners]);

  if (!estimate) return null;

  const openEnded = estimate.high >= MAX_GENERATIONS;
  const birthWindow = analysis?.homeBirthYear !== undefined ? ancestorBirthWindow(analysis.homeBirthYear, estimate) : undefined;
  const hotspots = analysis?.hotspots.slice(0, MAX_HOTSPOTS) ?? [];
  const topScore = hotspots[0]?.score || 1;

  return (
    <div className="mt-4 p-4 bg-indigo-50 rounded-lg">
      <h4 className="font-medium text-indigo-900 mb-2 flex items-center">
        <Clock className="w-4 h-4 mr-2" />
        Time + Place
      </h4>

      {/* Genetic clock */}
      <p className="text-sm text-indigo-900">
        Genetic clock: the shared ancestor most likely lived <strong>{estimate.mostLikely}{estimate.mostLikely >= MAX_GENERATIONS ? '+' : ''} generation{estimate.mostLikely === 1 ? '' : 's'} back</strong>
        {' '}(your {ancestorLabel(estimate.mostLikely)}'s generation).
        {' '}80% range: {estimate.low}–{estimate.high}{openEnded ? '+' : ''} generations
        {birthWindow && <> · born about <strong>{birthWindow.from}–{birthWindow.to}</strong></>}.
      </p>
      <div className="flex items-end gap-0.5 h-8 mt-2" aria-label="Probability of each generation">
        {estimate.probabilities.map((p, i) => (
          <div
            key={i}
            title={`${i + 1} generations back: ${Math.round(p * 100)}%`}
            className={`flex-1 rounded-t ${i + 1 >= estimate.low && i + 1 <= estimate.high ? 'bg-indigo-500' : 'bg-indigo-200'}`}
            style={{ height: `${Math.max(4, (p / Math.max(...estimate.probabilities)) * 100)}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-indigo-700 mt-0.5">
        <span>1 generation</span>
        <span>{MAX_GENERATIONS}+</span>
      </div>
      <p className="text-xs text-indigo-700 mt-2">
        Estimated from the members' segment lengths. One segment is a rough clock: shorter segments
        point further back with a wider range.
        {openEnded && ' This stretch is too short to date closely.'}
      </p>

      {!tree && (
        <p className="text-xs text-indigo-800 mt-3">
          Upload your family tree (GEDCOM) to see which ancestors and places fall in this window.
        </p>
      )}

      {/* Candidate ancestors in your tree */}
      {analysis && analysis.candidates.length > 0 && (
        <div className="mt-3">
          <h5 className="text-xs font-semibold text-indigo-900 uppercase tracking-wide mb-1">
            Your ancestors in this window{group.lineage ? ` on ${describeLineage(group.lineage)}'s line` : ''}
          </h5>
          <ul className="text-sm text-indigo-900 space-y-0.5">
            {analysis.candidates.slice(0, MAX_CANDIDATES).map(({ person, generation, path, weight }) => (
              <li key={person.id}>
                {person.name}
                <span className="text-xs text-indigo-700">
                  {' '}· {path} · {generation} gen{person.birthDate ? ` · b. ${person.birthDate}` : ''}
                  {person.birthPlace ? ` · ${person.birthPlace}` : ''} · {Math.round(weight * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Location clustering */}
      {analysis && (
        <div className="mt-3">
          <h5 className="text-xs font-semibold text-indigo-900 uppercase tracking-wide mb-1 flex items-center">
            <MapPin className="w-3 h-3 mr-1" />
            Where people lived in this window
          </h5>
          {hotspots.length === 0 ? (
            <p className="text-xs text-indigo-800">
              No places recorded for people in this time window
              {analysis.homeBirthYear === undefined ? ' (matches\' trees need your birth year to be placed in time)' : ''}.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {hotspots.map(spot => (
                <li key={spot.place} className="text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-indigo-100 rounded flex-shrink-0">
                      <div className="h-2 bg-indigo-500 rounded" style={{ width: `${(spot.score / topScore) * 100}%` }} />
                    </div>
                    <span className="font-medium text-indigo-900">{spot.place}</span>
                    {spot.neighborEffect && (
                      <span
                        className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-200 text-amber-900"
                        title={spot.sources.length >= 2 ? 'People from different trees lived here in this window' : 'People with different surnames lived here in this window'}
                      >
                        Neighbor effect
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-indigo-700 pl-[6.5rem]">
                    {spot.people.length} {spot.people.length === 1 ? 'person' : 'people'} · {spot.surnames.join(', ')}
                    {spot.fromYear !== undefined && ` · b. ${spot.fromYear}${spot.toYear !== spot.fromYear ? `–${spot.toYear}` : ''}`}
                    {spot.sources.length > 1 && ` · ${spot.sources.length} trees`}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-indigo-700 mt-2">
            Places are weighted by how likely the clock says each person's generation is. A neighbor-effect place,
            where different surnames or different trees converge, is a strong place to look for an ancestor
            who is not on paper.
          </p>
        </div>
      )}
    </div>
  );
};
