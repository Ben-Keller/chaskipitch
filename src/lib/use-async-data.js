import { useEffect, useState } from "react";

export function useAsyncData(loader, deps = []) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    data: null
  });

  useEffect(() => {
    let active = true;
    setState({ loading: true, error: null, data: null });

    loader()
      .then((data) => {
        if (!active) return;
        setState({ loading: false, error: null, data });
      })
      .catch((error) => {
        if (!active) return;
        setState({ loading: false, error, data: null });
      });

    return () => {
      active = false;
    };
  }, [loader, ...deps]);

  return state;
}
