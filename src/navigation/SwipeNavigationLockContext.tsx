import React from 'react';

type SwipeNavigationLockContextValue = {
    isSwipeLocked: boolean;
    setSwipeLocked: (locked: boolean) => void;
};

const SwipeNavigationLockContext = React.createContext<SwipeNavigationLockContextValue | undefined>(undefined);

export function SwipeNavigationLockProvider({ children }: { children: React.ReactNode }) {
    const [isSwipeLocked, setIsSwipeLocked] = React.useState(false);

    const value = React.useMemo(
        () => ({
            isSwipeLocked,
            setSwipeLocked: setIsSwipeLocked,
        }),
        [isSwipeLocked]
    );

    return (
        <SwipeNavigationLockContext.Provider value={value}>
            {children}
        </SwipeNavigationLockContext.Provider>
    );
}

export function useSwipeNavigationLock() {
    const context = React.useContext(SwipeNavigationLockContext);
    if (!context) {
        throw new Error('useSwipeNavigationLock must be used within SwipeNavigationLockProvider');
    }
    return context;
}
