import type { NextPage } from 'next';
import Error from 'next/error';
import type { GetStaticPaths, GetStaticProps } from 'next/types';
import Head from 'next/head';
import { ParsedUrlQuery } from 'querystring';
import { Container } from '@mui/material';
import { usePageView } from '../../hooks/use-page-view';
import { Layout as DocsLayout } from '../../layouts/docs';
import { ArticleContent } from '../../sections/docs/article-content';
import type { Article } from '../../types/docs';
import { getArticle, getArticles } from '../../utils/docs';

interface Params extends ParsedUrlQuery {
  slug: string;
}

export const getStaticPaths: GetStaticPaths = () => {
  const articles = getArticles(['slug']);

  const paths = articles.reduce(
    (acc: { params: Params }[], article) => {
      if (typeof article.slug !== 'undefined') {
        acc.push({
          params: {
            slug: article.slug
          }
        });
      }

      return acc;
    },
    []
  );

  return {
    paths,
    fallback: false
  };
};

export const getStaticProps: GetStaticProps = (context) => {
  const { slug } = context.params as Params;

  const article = getArticle(slug, ['content', 'slug', 'title']);

  return {
    props: {
      article
    }
  };
};

interface PageProps {
  article?: Article;
}

const Page: NextPage<PageProps> = (props) => {
  const { article } = props;

  usePageView();

  if (!article) {
    return <Error statusCode={404} />;
  }

  return (
    <>
      <Head>
        <title>
          {`Docs: ${article.title} | Devias Kit PRO`}
        </title>
      </Head>
      <Container
        maxWidth="lg"
        sx={{ pb: '120px' }}
      >
        <ArticleContent content={article.content || ''} />
      </Container>
    </>
  );
};

Page.getLayout = (page) => (
  <DocsLayout>
    {page}
  </DocsLayout>
);

export default Page;
