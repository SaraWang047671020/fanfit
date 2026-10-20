// The "ⓘ How this is calculated" texts, in one place so they stay in step with the code they describe
// (sponsor-fit.ts, fanfit.ts, fanfit-score.ts, predictions.ts, fan-taste.ts).
import InfoTip from "./InfoTip";

export function FitInfo({ brand }: { brand: string }) {
  return (
    <InfoTip title="How the fit score works">
      <span className="block">
        Qloo scores how strongly people who like {brand} also like each team. Raw scores can&apos;t be compared across teams (some teams score
        high for every brand), so each team&apos;s score is compared with how its fans rate a fixed panel of 40 big brands.
      </span>
      <span className="block">
        +2.0σ = two standard deviations above that panel. Strong ≥ 1.5σ, Good ≥ 0.75σ, Average ≥ 0.
      </span>
      <span className="block">
        With a target audience, Qloo scores your brand for those fans only (age, gender and interest as extra signals). Scores are re-centred so the
        average team matches the all-fans view; ▲▼ show how far a team moved.
      </span>
      <span className="block">It measures shared taste, not sales or how a sponsorship would perform.</span>
    </InfoTip>
  );
}

export function WhoToCallInfo() {
  return (
    <InfoTip title="How “Who to call” is ranked">
      <span className="block">1. Qloo demographics estimate the fans&apos; age mix (see Fan mix).</span>
      <span className="block">
        2. For each of six age groups, Qloo ranks brands (or local places) liked by fans of the team in its city. Each candidate gets a percentile
        within each group.
      </span>
      <span className="block">
        3. Fit score = those percentiles weighted by the fan mix. Brands with no city data are scored on the team alone, pulled toward the middle.
      </span>
      <span className="block">4. A web search looks for a reason to call now; each timing point (0–3) moves a candidate up 3 places, with sources.</span>
      <span className="block">
        5. Anything already signed, or in a category a current sponsor holds, is set aside. Local businesses are set aside only if already a sponsor.
      </span>
    </InfoTip>
  );
}

export function CategoryInfo() {
  return (
    <InfoTip title="How categories are filled">
      <span className="block">
        One Qloo request per sponsorship category: brands tagged with that industry, ranked by how much fans of the team in its city like them.
      </span>
      <span className="block">If the city leaves too few brands, the whole US is used instead (marked US-wide). Categories a current sponsor holds are flagged.</span>
    </InfoTip>
  );
}

export function FanMixInfo() {
  return (
    <InfoTip title="Where the fan mix comes from">
      <span className="block">
        Qloo&apos;s demographics for the team&apos;s fans: how over- or under-represented each age group is compared with the average. They become
        the weights in the fit score.
      </span>
      <span className="block">Drag the sliders to rank for a different audience, for example if your season-ticket base skews older.</span>
    </InfoTip>
  );
}

export function PredictedInfo() {
  return (
    <InfoTip title="How predictions are checked">
      <span className="block">
        Predicted: the age group whose fans like this business most compared with the other candidates, from your saved sponsor-finder run.
      </span>
      <span className="block">Actual: the age fans give (optionally) when they claim a code.</span>
      <span className="block">
        Lift = the predicted group&apos;s share of claims ÷ its share of your fans. Above 1× means the recommendation drew more of them than chance.
        An offer is judged once it has 10 claims with an age.
      </span>
    </InfoTip>
  );
}

export function ForYouInfo({ align = "left" }: { align?: "left" | "right" }) {
  return (
    <InfoTip title="How “For you” works" align={align}>
      <span className="block">
        For each taste you pick, Qloo ranks your teams&apos; partner businesses by how much people who like it also like each place.
      </span>
      <span className="block">
        A place&apos;s match is its average rank across your tastes; the taste it ranks best under is the “because”. Strong = top quarter of your
        places, Good = top half.
      </span>
      <span className="block">Your tastes are private: teams and sponsors never see them.</span>
    </InfoTip>
  );
}
