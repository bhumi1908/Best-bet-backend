export type SubscriptionStatus = "ACTIVE" | "EXPIRED" | "CANCELED";
export interface Subscription {
  subscriptionId: number
  user: User
  plan: Plan
  payment: Payment | null
  status: string
  startDate: string
  endDate: string
  createdAt: string
}

export interface User {
  id: number
  name: string
  email: string
}

export interface Plan {
  id: number
  name: string
  price: number
  duration: number
  features: Features[]
}

export interface Features {
  id: number;
  name: string;
  description: string | null;
}
export interface Payment {
  amount: number
  status: string
  stripePaymentId: string | null
}


