import { RiskSnapshot } from "../types/riskSnapshot";

type SnapshotListener = (snapshot: RiskSnapshot) => void;

type Subscription = {
  locationIds: Set<string>;
  listener: SnapshotListener;
};

export class RiskStreamBroker {
  private nextSubscriptionId = 1;
  private readonly subscriptions = new Map<number, Subscription>();

  subscribe(locationIds: string[], listener: SnapshotListener) {
    const subscriptionId = this.nextSubscriptionId++;
    this.subscriptions.set(subscriptionId, {
      locationIds: new Set(locationIds),
      listener,
    });

    return () => {
      this.subscriptions.delete(subscriptionId);
    };
  }

  publish(snapshot: RiskSnapshot) {
    for (const subscription of this.subscriptions.values()) {
      if (!subscription.locationIds.has(snapshot.locationId)) {
        continue;
      }

      subscription.listener(snapshot);
    }
  }
}
