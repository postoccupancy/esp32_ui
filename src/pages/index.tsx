import type { NextPage } from 'next';

const Page: NextPage = () => null;

export const getServerSideProps = async () => {
  return {
    redirect: {
      destination: '/dashboard',
      permanent: false
    }
  };
};

export default Page;
