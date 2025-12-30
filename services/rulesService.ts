import { db } from './firebase';
import { collection, addDoc, getDocs, query, where, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { ActiveRule, CounterfactualRule } from '../types';

/**
 * CONTROL PLANE
 * Manages the persistence of rules.
 * Separation of concerns: specific to user ID.
 */

export const deployRule = async (userId: string, generatedRule: CounterfactualRule): Promise<ActiveRule> => {
    const newRule: Omit<ActiveRule, 'id'> = {
        rule_id: generatedRule.id,
        deploy_state: 'active',
        condition: generatedRule.condition,
        action: generatedRule.action,
        description: generatedRule.description,
        risk_score: 0.1, // Default low risk for MVP
        created_at: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, 'users', userId, 'rules'), newRule);
    
    return {
        id: docRef.id,
        ...newRule
    };
};

export const fetchActiveRules = async (userId: string): Promise<ActiveRule[]> => {
    const q = query(collection(db, 'users', userId, 'rules'));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    })) as ActiveRule[];
};

export const deleteRule = async (userId: string, ruleId: string): Promise<void> => {
    await deleteDoc(doc(db, 'users', userId, 'rules', ruleId));
};

export const logDecisionFeedback = async (userId: string, decisionId: string, type: 'SUCCESS' | 'OVERRIDE', reason?: string) => {
    try {
        await addDoc(collection(db, 'users', userId, 'decision_feedback'), {
            decision_id: decisionId,
            feedback_type: type,
            override_reason: reason || null,
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.error("Failed to log feedback", e);
    }
};