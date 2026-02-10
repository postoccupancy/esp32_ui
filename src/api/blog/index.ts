import type { Post } from '../../types/blog';
import { deepCopy } from '../../utils/deep-copy';
import { post, posts } from './data';

type GetPostsRequest = {};

type GetPostsResponse = Promise<Post[]>;

type GetPostRequest = {};

type GetPostResponse = Promise<Post>;

class BlogApi {
  getPosts(request?: GetPostsRequest): GetPostsResponse {
    return Promise.resolve(deepCopy(posts));
  }

  getPost(request?: GetPostRequest): GetPostResponse {
    return Promise.resolve(deepCopy(post));
  }
}

export const blogApi = new BlogApi();
