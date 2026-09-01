import { uniqueSlug } from '@gm/utils';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { PostModel } from './post.model.js';
import { AuditService } from '../audit/audit.service.js';

export class BlogService {
  // --- Lecture publique ---

  static async listPublished(params: { category?: string; page: number; pageSize: number }) {
    const filter: Record<string, unknown> = { published: true };
    if (params.category) filter.category = params.category;

    const skip = (params.page - 1) * params.pageSize;
    const [items, total] = await Promise.all([
      PostModel.find(filter).sort({ publishedAt: -1 }).skip(skip).limit(params.pageSize),
      PostModel.countDocuments(filter),
    ]);

    return {
      items,
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages: Math.ceil(total / params.pageSize),
    };
  }

  static async getBySlug(slug: string) {
    const post = await PostModel.findOne({ slug, published: true });
    if (!post) {
      throw AppError.notFound(ErrorCode.NOT_FOUND, 'Article introuvable');
    }
    return post;
  }

  // --- Admin ---

  static async listAllAdmin() {
    return PostModel.find({}).sort({ createdAt: -1 });
  }

  static async create(input: {
    title: string;
    excerpt: string;
    content: string;
    coverImage?: string;
    authorId: string;
    category: string;
    tags?: string[];
    seoTitle?: string;
    seoDescription?: string;
    published?: boolean;
  }) {
    let slug = uniqueSlug(input.title, Date.now().toString(36));
    // Garantie d'unicité au cas rare où deux articles au même titre sont
    // créés à la même milliseconde.
    for (let attempts = 0; attempts < 3; attempts += 1) {
      const clash = await PostModel.findOne({ slug });
      if (!clash) break;
      slug = uniqueSlug(input.title, `${Date.now().toString(36)}${attempts}`);
    }

    const post = await PostModel.create({
      title: input.title,
      slug,
      excerpt: input.excerpt,
      content: input.content,
      coverImage: input.coverImage,
      author: input.authorId,
      category: input.category,
      tags: input.tags ?? [],
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      published: input.published ?? false,
      publishedAt: input.published ? new Date() : undefined,
    });

    await AuditService.log({
      actor: input.authorId,
      action: 'admin.blog_post_created',
      entityType: 'Post',
      entityId: String(post._id),
    });

    return post;
  }

  static async update(
    postId: string,
    adminId: string,
    patch: Partial<{
      title: string;
      excerpt: string;
      content: string;
      coverImage: string;
      category: string;
      tags: string[];
      seoTitle: string;
      seoDescription: string;
      published: boolean;
    }>,
  ) {
    const post = await PostModel.findById(postId);
    if (!post) {
      throw AppError.notFound(ErrorCode.NOT_FOUND, 'Article introuvable');
    }

    const wasPublished = post.published;
    Object.assign(post, patch);
    if (patch.published && !wasPublished) {
      post.publishedAt = new Date();
    }
    await post.save();

    await AuditService.log({
      actor: adminId,
      action: 'admin.blog_post_updated',
      entityType: 'Post',
      entityId: postId,
      metadata: { fields: Object.keys(patch) },
    });

    return post;
  }

  static async delete(postId: string, adminId: string) {
    const post = await PostModel.findByIdAndDelete(postId);
    if (!post) {
      throw AppError.notFound(ErrorCode.NOT_FOUND, 'Article introuvable');
    }
    await AuditService.log({
      actor: adminId,
      action: 'admin.blog_post_deleted',
      entityType: 'Post',
      entityId: postId,
    });
  }
}
