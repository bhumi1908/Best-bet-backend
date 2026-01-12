import { StringSchema } from "joi";

export type SubscriptionStatus = "ACTIVE" | "EXPIRED" | "CANCELED" | "REFUNDED" | "TRIAL" | "PAST_DUE";
type PaymentStatus =
  "PENDING" |
  "SUCCESS" |
  "FAILED" |
  "REFUNDED"  

export interface State {
  id: number
  name: string
}

export interface Subscription {
  subscriptionId: number
  user: User
  plan: Plan
  payment: Payment | null
  stripeSubscriptionId: string | null
  status: string
  startDate: string
  endDate: string
  createdAt: string
}

export interface User {
  id: number
  name: string
  email: string
  phoneNo: string | null
  stripeCustomerId: string | null
  createdAt: Date
  isTrial ?: boolean
  state: State | null
}



export interface Plan {
  id: number
  name: string
  price: number
  isActive: boolean
  duration: number
  description: string | null
  features: Features[]
}

export interface Features {
  id: number;
  name: string;
  description: string | null;
}
export interface Payment {
  amount: number
  paymentMethod: string
  stripePaymentId: string | null
  status: PaymentStatus
  createdAt: Date
}


