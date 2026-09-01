import { Schema, model, type InferSchemaType } from 'mongoose';

const postSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    excerpt: { type: String, required: true, maxlength: 300 },
    content: { type: String, required: true },
    coverImage: { type: String },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, required: true },
    tags: { type: [String], default: [] },
    seoTitle: { type: String },
    seoDescription: { type: String },
    published: { type: Boolean, default: false },
    publishedAt: { type: Date },
  },
  { timestamps: true },
);

// slug a déjà `unique: true` inline — pas de redéclaration ici (évite le
// warning Mongoose "Duplicate schema index", cf. audit précédent).
postSchema.index({ published: 1, publishedAt: -1 });
postSchema.index({ category: 1, published: 1 });

export type PostDocument = InferSchemaType<typeof postSchema>;
export const PostModel = model('Post', postSchema);
