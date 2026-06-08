// The notebook hub lives at /homepage. The site root redirects there so the
// bare URL and the navbar title keep working.
import React from 'react';
import { Redirect } from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';

export default function Index() {
  return <Redirect to={useBaseUrl('/homepage')} />;
}
